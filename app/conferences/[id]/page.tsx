'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { loadKey, type Key } from '../../../lib/key';

type Paper = {
  id: string; title: string; abstract: string; pdf: string | null; url: string;
  track: string; workshop: string | null; decision: string | null; topic: string | null;
};
// probs[id]: undefined = not judged yet, NaN = judge call failed (kept visible)
type Round = { query: string; probs: Record<string, number>; pending: boolean };

// Batch by text size, not count: Jev takes 64k tokens/request. ~4.7 chars/token measured → ≈53k tokens, ~170 papers.
const CHAR_BUDGET = 250_000;
// All batches in one wave. Measured NeurIPS 2025 on OpenRouter: 33 calls @32 parallel = 1.6s (vs 3.5s at 80×8), same cost
const CONCURRENCY = 32;

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

  // per-paper state for the dot field, in file order: -1 idle, -2 waiting for Jev, -3 filtered out, else P(relevant)
  const states = useMemo(() => {
    const last = rounds.at(-1);
    return Float32Array.from(papers, (p) => {
      if (!last) return -1;
      if (!rounds.every((r) => passes(p, r))) return -3;
      const v = last.probs[p.id];
      return v === undefined || Number.isNaN(v) ? -2 : v;
    });
  }, [papers, rounds, threshold]);

  // uncontrolled input: typing must not re-render the 6k-row list
  async function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const q = String(new FormData(form).get('q') ?? '').trim();
    if (!q || pending) return;
    const idx = rounds.length;
    const survivors = visible; // refine: only judge current survivors
    setRounds((rs) => [...rs, { query: q, probs: {}, pending: true }]);
    form.reset();

    const batches: string[][] = [];
    let chars = Infinity;
    for (const p of survivors) {
      const n = p.title.length + p.abstract.length + 150; // + question wording
      if (chars + n > CHAR_BUDGET) { batches.push([]); chars = 0; }
      batches.at(-1)!.push(p.id);
      chars += n;
    }

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
  const done = rounds.length > 0 && !pending;

  if (!key) return null;
  return (
    <main>
      <nav className="top">
        <Link href="/conferences" className="wordmark">Find Papers</Link>
        <Link href="/conferences">학회 바꾸기</Link>
      </nav>
      <h1>{name}</h1>

      <DotField states={states} />

      <div className="stats">
        <span className="count" aria-live="polite">{visible.length.toLocaleString()}</span>
        <span className="of">/ {papers.length.toLocaleString()}편{pending && ' · 판정 중'}</span>
        <label className="threshold">
          기준값
          <input type="range" min={0} max={1} step={0.05} value={threshold}
            onChange={(e) => setThreshold(+e.target.value)} />
          <span className="mono">{threshold.toFixed(2)}</span>
        </label>
      </div>

      <form onSubmit={search} className="search">
        <input
          type="text"
          name="q"
          autoComplete="off"
          aria-label="연구 주제"
          placeholder={rounds.length ? '남은 논문에서 더 좁혀보기' : '찾고 싶은 연구 주제 (예: mechanistic interpretability of LLMs)'}
        />
        <button disabled={pending || !papers.length}>{rounds.length ? '좁히기' : '찾기'}</button>
      </form>

      {rounds.length > 0 && (
        <div className="trail">
          {rounds.map((r, i) => (
            <span key={i}>{i > 0 && <span className="arrow">→ </span>}<span className="step">{r.query}</span></span>
          ))}
          <button type="button" className="ghost" disabled={pending}
            onClick={() => { setRounds([]); setErrors(0); setLastError(''); }}>처음부터</button>
        </div>
      )}
      {errors > 0 && (
        <p className="err">
          {lastError} — 판정하지 못한 묶음 {errors}개는 목록에 남겨두었습니다.
          {lastError.includes('키') && <> <Link href="/">키 바꾸기</Link></>}
        </p>
      )}

      {done && visible.length === 0 ? (
        <p className="empty">기준값 {threshold.toFixed(2)}을 넘는 논문이 없습니다. 기준값을 낮추거나 주제를 넓혀 보세요.</p>
      ) : (
        <ul className="papers">
          {visible.map((p) => <Row key={p.id} p={p} prob={last?.probs[p.id]} />)}
        </ul>
      )}
    </main>
  );
}

// The whole conference as dots, one per paper. Survivors stay inked and highlighted; the rest fade as Jev answers.
function DotField({ states }: { states: Float32Array }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = ref.current;
    const n = states.length;
    if (!c || !width || !n) return;
    const h = c.clientHeight, dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(c);
    const color = (v: string) => css.getPropertyValue(v).trim();
    const [ink, muted, line, mark] = ['--ink', '--muted', '--line', '--mark'].map(color);

    const cols = Math.ceil(width / Math.sqrt((width * h) / n));
    const cw = width / cols, ch = h / Math.ceil(n / cols);
    const r = Math.max(0.9, Math.min(cw, ch) * 0.34);
    const dot = (i: number, rad: number) => {
      ctx.beginPath();
      ctx.arc(((i % cols) + 0.5) * cw, (Math.floor(i / cols) + 0.5) * ch, rad, 0, 7);
      ctx.fill();
    };
    for (let i = 0; i < n; i++) {
      const s = states[i];
      if (s >= 0) continue; // survivors drawn last, on top
      ctx.globalAlpha = s === -3 ? 1 : s === -2 ? 0.55 : 0.3;
      ctx.fillStyle = s === -3 ? line : muted;
      dot(i, r);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < n; i++) {
      if (states[i] < 0) continue;
      ctx.fillStyle = mark;
      dot(i, r * 2.1);
      ctx.fillStyle = ink;
      dot(i, r);
    }
  }, [states, width]);

  const kept = states.reduce((a, s) => a + (s >= 0 ? 1 : 0), 0);
  return <canvas ref={ref} className="field" role="img" aria-label={`전체 ${states.length}편 중 ${kept}편이 남았습니다`} />;
}

// memo: a streamed batch re-renders only the rows whose prob changed
const Row = memo(function Row({ p, prob }: { p: Paper; prob?: number }) {
  const judged = prob !== undefined && !Number.isNaN(prob);
  return (
    <li className="paper">
      <span className="prob" style={{ '--p': judged ? prob : 0 } as React.CSSProperties}>{judged ? prob.toFixed(2) : ''}</span>
      <div>
        <a className="title" href={p.url} target="_blank" rel="noreferrer">{p.title}</a>
        <div className="meta">
          {p.track}
          {p.decision && <> · <span className={`tag ${p.decision}`}>{p.decision}</span></>}
          {p.workshop && ` · ${p.workshop}`}
          {p.topic && ` · ${p.topic}`}
          {p.pdf && <> · <a href={p.pdf} target="_blank" rel="noreferrer">PDF ↗</a></>}
        </div>
        <details><summary>초록</summary><p>{p.abstract}</p></details>
      </div>
    </li>
  );
});
