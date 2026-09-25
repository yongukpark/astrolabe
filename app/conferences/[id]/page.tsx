'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { memo, useEffect, useMemo, useState } from 'react';
import { loadKey, type Key } from '../../../lib/key';

type Paper = {
  id: string; title: string; abstract: string; pdf: string | null; url: string;
  track: string; workshop: string | null; decision: string | null; topic: string | null;
};
// probs[id]: undefined = not judged yet, NaN = judge call failed (kept visible)
type Round = { query: string; probs: Record<string, number>; pending: boolean };

const BATCH = 80; // must match MAX_BATCH in api/judge
const CONCURRENCY = 8; // measured on OpenRouter: 75 calls, 0 fails

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [key, setKey] = useState<Key | null>(null);
  const [name, setName] = useState('');
  const [lastError, setLastError] = useState('');
  const [papers, setPapers] = useState<Paper[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [threshold, setThreshold] = useState(0.65);
  const [errors, setErrors] = useState(0);

  useEffect(() => {
    const k = loadKey();
    if (!k) return router.replace('/');
    setKey(k);
    fetch(`/data/${id}.json`).then((r) => r.json()).then(setPapers);
    fetch('/data/index.json').then((r) => r.json())
      .then((cs: { id: string; name: string }[]) => setName(cs.find((c) => c.id === id)?.name ?? id));
  }, [id, router]);

  const passes = (p: Paper, r: Round) => {
    const v = r.probs[p.id];
    if (v === undefined) return r.pending;
    return Number.isNaN(v) || v >= threshold;
  };

  const visible = useMemo(() => {
    const last = rounds.at(-1);
    return papers
      .filter((p) => rounds.every((r) => passes(p, r)))
      .sort((a, b) => (last ? (last.probs[b.id] ?? 0) - (last.probs[a.id] ?? 0) : 0));
  }, [papers, rounds, threshold]);

  const pending = rounds.some((r) => r.pending);

  // uncontrolled input: typing must not re-render the 6k-row list
  async function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const q = String(new FormData(form).get('q') ?? '').trim();
    if (!q || pending) return;
    const idx = rounds.length;
    const ids = visible.map((p) => p.id); // refine: only judge current survivors
    setRounds((rs) => [...rs, { query: q, probs: {}, pending: true }]);
    form.reset();

    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));

    const update = (probs: Record<string, number>) =>
      setRounds((rs) => rs.map((r, i) => (i === idx ? { ...r, probs: { ...r.probs, ...probs } } : r)));

    const worker = async () => {
      for (let b; (b = batches.shift()); ) {
        try {
          const res = await fetch('/api/judge', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-provider': key!.provider, 'x-api-key': key!.apiKey },
            body: JSON.stringify({ conf: id, query: q, ids: b }),
          });
          if (!res.ok) {
            const msg = res.status === 401 ? 'API 키가 올바르지 않습니다' : res.status === 402 ? '크레딧이 부족합니다'
              : res.status === 429 ? '요청이 너무 많습니다 (잠시 후 다시)' : `오류 ${res.status}`;
            setLastError(msg);
            throw new Error(await res.text());
          }
          update(await res.json());
        } catch (err) {
          console.error(err);
          setErrors((n) => n + 1);
          update(Object.fromEntries(b.map((id) => [id, NaN])));
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRounds((rs) => rs.map((r, i) => (i === idx ? { ...r, pending: false } : r)));
  }

  const last = rounds.at(-1);

  if (!key) return null;
  return (
    <main>
      <div className="row">
        <h1>{name}</h1>
        <Link href="/conferences" className="muted">← 학회 선택</Link>
      </div>
      <form onSubmit={search}>
        <input
          type="text"
          name="q"
          autoComplete="off"
          placeholder={rounds.length ? '더 좁혀보기…' : '찾고 싶은 연구 주제 (예: mechanistic interpretability of LLMs)'}
        />
        <button disabled={pending || !papers.length}>{pending ? '판정 중…' : '찾기'}</button>
      </form>

      <div className="bar">
        <span className="count">{visible.length.toLocaleString()}</span>
        <span>/ {papers.length.toLocaleString()}편</span>
        <label>
          기준값 {threshold.toFixed(2)}{' '}
          <input type="range" min={0} max={1} step={0.05} value={threshold}
            onChange={(e) => setThreshold(+e.target.value)} />
        </label>
        {rounds.length > 0 && <button type="button" onClick={() => { setRounds([]); setErrors(0); setLastError(''); }} disabled={pending}>초기화</button>}
        {errors > 0 && <span className="err">실패한 묶음 {errors}개 · {lastError} (해당 논문은 남겨둠){lastError.includes('키') && <> · <Link href="/">키 변경</Link></>}</span>}
      </div>
      {rounds.length > 0 && (
        <div className="bar rounds">{rounds.map((r, i) => <span key={i}>{r.query}</span>)}</div>
      )}

      <ul>
        {visible.map((p) => <Row key={p.id} p={p} prob={last?.probs[p.id]} />)}
      </ul>
    </main>
  );
}

// memo: a streamed batch re-renders only the rows whose prob changed
const Row = memo(function Row({ p, prob }: { p: Paper; prob?: number }) {
  return (
    <li>
      <div>
        {prob !== undefined && !Number.isNaN(prob) && <span className="p">{prob.toFixed(2)} </span>}
        <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a>
      </div>
      <div className="meta">
        {p.track}{p.workshop ? ` · ${p.workshop}` : ''}{p.decision ? ` · ${p.decision}` : ''}
        {p.topic ? ` · ${p.topic}` : ''}
        {p.pdf && <> · <a href={p.pdf} target="_blank" rel="noreferrer">PDF</a></>}
      </div>
      <details><summary className="meta">abstract</summary><p>{p.abstract}</p></details>
    </li>
  );
});
