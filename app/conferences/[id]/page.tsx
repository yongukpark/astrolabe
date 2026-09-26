'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { download, toCsv } from '../../../lib/csv';
import { loadKey, type Key } from '../../../lib/key';
import { Matrix, useConfs } from '../../Matrix';

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
  const confs = useConfs();
  const name = confs.find((c) => c.id === id)?.name ?? '';
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

  // The list starts empty; during the first search it fills with judged hits only (not the whole conference)
  const listed = rounds.length === 0 ? []
    : rounds.length === 1 && pending ? visible.filter((p) => rounds[0].probs[p.id] !== undefined)
    : visible;

  // per-paper state for the star field, in file order: -1 idle, -2 waiting for Jev, -3 filtered out, else P(relevant)
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

  function exportCsv() {
    const score = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? null : +v.toFixed(3));
    const rows = [
      ['순위', ...rounds.map((r) => `점수: ${r.query}`), '제목', '발표', '트랙', '분야', 'PDF', '링크', '초록'],
      ...visible.map((p, i) => [i + 1, ...rounds.map((r) => score(r.probs[p.id])), p.title, p.decision, p.track, p.topic, p.pdf, p.url, p.abstract]),
    ];
    const slug = rounds.map((r) => r.query).join('-').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60).replace(/^-|-$/g, '');
    download(`${id}-${slug || 'papers'}.csv`, toCsv(rows));
  }

  if (!key) return null;
  return (
    <div className="sky">
      <section className="sky-main">
        <header className="sky-head">
          <Link href="/conferences" className="wordmark">Find Papers</Link>
          <h1>{name}</h1>
          <p className="tally" aria-live="polite">
            {rounds.length ? <><b>{visible.length.toLocaleString()}</b> / {papers.length.toLocaleString()} 별이 남음</> : <>{papers.length.toLocaleString()} 편의 논문</>}
            {pending && ' · 판정 중'}
          </p>
        </header>

        <StarField papers={papers} states={states} />

        <div className="sky-controls">
          <form onSubmit={search} className="search">
            <input
              type="text"
              name="q"
              autoComplete="off"
              aria-label="연구 주제"
              placeholder={rounds.length ? '남은 별에서 더 좁혀보기' : '찾고 싶은 연구 주제 (예: mechanistic interpretability of LLMs)'}
            />
            <button disabled={pending || !papers.length}>{rounds.length ? '좁히기' : '찾기'}</button>
          </form>
          {rounds.length > 0 && (
            <div className="trail">
              {rounds.map((r, i) => (
                <span key={i}>{i > 0 && <span className="arrow">→ </span>}<span className="step">{r.query}</span></span>
              ))}
            </div>
          )}
          {errors > 0 && (
            <p className="err">
              {lastError} — 판정하지 못한 묶음 {errors}개는 목록에 남겨두었습니다.
              {lastError.includes('키') && <> <Link href="/">키 바꾸기</Link></>}
            </p>
          )}
          <div className="sky-foot">
            <Matrix confs={confs} current={id} compact />
            <label className="threshold">
              기준값
              <input type="range" min={0} max={1} step={0.05} value={threshold}
                onChange={(e) => setThreshold(+e.target.value)} />
              <span className="num">{threshold.toFixed(2)}</span>
            </label>
          </div>
        </div>
      </section>

      <aside className="sky-panel" aria-label="남은 논문">
        <div className="panel-head">
          <span>{rounds.length ? '가장 밝은 별' : '검색하면 여기에 남은 논문이 나옵니다'}</span>
          {rounds.length > 0 && (
            <span className="panel-actions">
              <button type="button" className="ghost" disabled={pending || !visible.length} onClick={exportCsv}>CSV</button>
              <button type="button" className="ghost" disabled={pending}
                onClick={() => { setRounds([]); setErrors(0); setLastError(''); }}>처음부터</button>
            </span>
          )}
        </div>
        {done && visible.length === 0 ? (
          <p className="empty">기준값 {threshold.toFixed(2)}을 넘는 논문이 없습니다. 기준값을 낮추거나 주제를 넓혀 보세요.</p>
        ) : (
          <ul className="papers">
            {listed.map((p) => <Row key={p.id} p={p} prob={last?.probs[p.id]} />)}
          </ul>
        )}
      </aside>
    </div>
  );
}

const topicOf = (p: Paper) => p.topic?.split('->')[0] ?? '미분류';
// labels for narrow screens
const SHORT: Record<string, string> = {
  'General Machine Learning': 'GENERAL ML', 'Reinforcement Learning': 'RL', 'Probabilistic Methods': 'PROBABILISTIC',
  'Computer Vision': 'VISION', 'Data-centric AI': 'DATA-CENTRIC', 'Social Aspects': 'SOCIAL', 'Deep Learning': 'DEEP LEARNING',
};

// Every paper is a star, grouped into constellations by the conference's own top-level topic.
// Survivors glow; each constellation's label shows how many of its stars survived.
function StarField({ papers, states }: { papers: Paper[]; states: Float32Array }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // constellations: topics largest first, each paper's slot within its topic
  const groups = useMemo(() => {
    const by = new Map<string, number[]>();
    papers.forEach((p, i) => by.set(topicOf(p), [...(by.get(topicOf(p)) ?? []), i]));
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [papers]);

  useEffect(() => {
    const c = ref.current;
    const { w, h } = size;
    if (!c || !w || !groups.length) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(c);
    const color = (v: string) => css.getPropertyValue(v).trim();
    const [star, pendingC, out, gold, dim, fg] = ['--star', '--star-wait', '--star-out', '--gold', '--dim', '--fg'].map(color);

    // lay constellations on a grid, radius by sqrt(size)
    const k = groups.length;
    const cols = Math.max(1, Math.round(Math.sqrt((k * w) / h)));
    const rows = Math.ceil(k / cols);
    const cw = w / cols, ch = h / rows;
    const max = groups[0][1].length;
    const rMax = Math.min(cw, ch) * 0.36;
    const judged = states.some((s) => s !== -1);

    groups.forEach(([topic, idx], g) => {
      const cx = (g % cols + 0.5) * cw + (hash(topic) - 0.5) * cw * 0.12;
      const cy = (Math.floor(g / cols) + 0.55) * ch + (hash(topic + 'y') - 0.5) * ch * 0.1;
      const R = rMax * Math.max(0.45, Math.sqrt(idx.length / max));
      let lit = 0;
      // sunflower spiral: even, organic spread
      idx.forEach((pi, j) => {
        const r = R * Math.sqrt((j + 0.5) / idx.length), th = j * 2.39996;
        const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r * 0.82;
        const s = states[pi];
        if (s >= 0) {
          lit++;
          ctx.fillStyle = gold;
          ctx.shadowColor = gold;
          ctx.shadowBlur = 6 + 10 * s;
          dot(ctx, x, y, 1.6 + 2 * s);
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = s === -3 ? out : s === -2 ? pendingC : star;
          dot(ctx, x, y, hash(pi + '') < 0.25 ? 1.5 : 1);
        }
      });
      ctx.font = '12px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = lit ? fg : dim;
      const full = topic.toUpperCase();
      ctx.fillText(ctx.measureText(full).width < cw - 8 ? full : SHORT[topic] ?? full.split(' ').map((w) => w[0]).join(''), cx, cy - R * 0.82 - 14);
      if (judged) {
        ctx.fillStyle = lit ? gold : dim;
        ctx.fillText(`${lit} / ${idx.length}`, cx, cy - R * 0.82 - 1);
      }
    });
  }, [groups, states, size]);

  const lit = states.reduce((a, s) => a + (s >= 0 ? 1 : 0), 0);
  return <canvas ref={ref} className="stars" role="img" aria-label={`논문 ${states.length}편 중 ${lit}편이 빛나고 있습니다`} />;
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 7);
  ctx.fill();
}

// stable 0..1 per string, for small deterministic jitter
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

// memo: a streamed batch re-renders only the rows whose prob changed
const Row = memo(function Row({ p, prob }: { p: Paper; prob?: number }) {
  const judged = prob !== undefined && !Number.isNaN(prob);
  return (
    <li className="paper">
      <span className="prob">{judged ? prob.toFixed(2) : ''}</span>
      <div>
        <a className="title" href={p.url} target="_blank" rel="noreferrer">{p.title}</a>
        <div className="meta">
          {[p.decision, topicOf(p)].filter(Boolean).join(' · ')}
          {p.pdf && <> · <a href={p.pdf} target="_blank" rel="noreferrer">PDF ↗</a></>}
        </div>
        <details><summary>초록</summary><p>{p.abstract}</p></details>
      </div>
    </li>
  );
});
