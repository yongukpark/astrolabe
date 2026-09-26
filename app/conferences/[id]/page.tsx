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
type Search = { query: string; probs: Record<string, number>; pending: boolean };

// Batch by text size, not count: Jev takes 64k tokens/request. ~4.7 chars/token measured → ≈53k tokens, ~170 papers.
const CHAR_BUDGET = 250_000;
// All batches in one wave. Measured NeurIPS 2025 on OpenRouter: 33 calls @32 parallel = 1.6s (vs 3.5s at 80×8), same cost
const CONCURRENCY = 32;
const MAX_PER_BATCH = 200; // title-only conferences: titles are short, so cap by count too (route allows ≤400)

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [key, setKey] = useState<Key | null>(null);
  const confs = useConfs();
  const conf = confs.find((c) => c.id === id);
  const name = conf?.name ?? '';
  const [lastError, setLastError] = useState('');
  const [papers, setPapers] = useState<Paper[]>([]);
  const [found, setFound] = useState<Search | null>(null); // one search at a time; a new one replaces it
  const [threshold, setThreshold] = useState(0.65);
  const [errors, setErrors] = useState(0);

  useEffect(() => {
    const k = loadKey();
    if (!k) return router.replace('/');
    setKey(k);
    fetch(`/data/${id}.json`).then((r) => r.json()).then(setPapers);
  }, [id, router]);

  // title-only conferences miss about half the matches at 0.65 (measured on NeurIPS 2025): start them lower
  useEffect(() => {
    if (conf) setThreshold(conf.titleOnly ? 0.4 : 0.65);
  }, [conf?.id]);

  const pending = !!found?.pending;
  const prob = (p: Paper) => found?.probs[p.id];
  const passes = (p: Paper) => {
    const v = prob(p);
    return v === undefined ? pending : Number.isNaN(v) || v >= threshold;
  };

  // score high → low, ties alphabetical by title
  const visible = useMemo(() => !found ? [] : papers
    .filter(passes)
    .sort((a, b) => (prob(b) || 0) - (prob(a) || 0) || a.title.localeCompare(b.title)),
  [papers, found, threshold]);

  // while judging, list only papers that already have a score (not the whole conference)
  const listed = pending ? visible.filter((p) => prob(p) !== undefined) : visible;

  // per-paper state for the star field, in file order: -1 idle, -2 waiting for Jev, -3 filtered out, else P(relevant)
  const states = useMemo(() => Float32Array.from(papers, (p) => {
    if (!found) return -1;
    if (!passes(p)) return -3;
    const v = prob(p);
    return v === undefined || Number.isNaN(v) ? -2 : v;
  }), [papers, found, threshold]);

  // uncontrolled input: typing must not re-render the list; the query stays in the box so it can be tweaked and re-run
  async function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
    if (!q || pending) return;
    setFound({ query: q, probs: {}, pending: true });
    setErrors(0);
    setLastError('');

    const batches: string[][] = [];
    let chars = Infinity;
    for (const p of papers) {
      const n = p.title.length + p.abstract.length + 150; // + question wording
      if (chars + n > CHAR_BUDGET || batches.at(-1)!.length >= MAX_PER_BATCH) { batches.push([]); chars = 0; }
      batches.at(-1)!.push(p.id);
      chars += n;
    }

    const update = (probs: Record<string, number>) =>
      setFound((f) => f && { ...f, probs: { ...f.probs, ...probs } });

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
    setFound((f) => f && { ...f, pending: false });
  }

  function exportCsv() {
    const score = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? null : +v.toFixed(3));
    const rows = [
      ['순위', '점수', '제목', '발표', '트랙', '분야', 'PDF', '링크', '초록'],
      ...visible.map((p, i) => [i + 1, score(prob(p)), p.title, p.decision, p.track, p.topic, p.pdf, p.url, p.abstract]),
    ];
    const slug = found!.query.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60).replace(/^-|-$/g, '');
    download(`${id}-${slug || 'papers'}.csv`, toCsv(rows));
  }

  if (!key) return null;
  return (
    <div className="sky">
      <section className="sky-main">
        <header className="sky-head">
          <Link href="/conferences" className="wordmark">Astrolabe</Link>
          <h1>{name}</h1>
          {conf?.titleOnly && <p className="title-only">초록이 아직 공개되지 않아 제목만으로 판정합니다 · 정확도가 낮습니다</p>}
          {found && (
            <p className="tally" aria-live="polite">
              <b>{visible.length.toLocaleString()}</b> / {papers.length.toLocaleString()} 별이 남음{pending && ' · 판정 중'}
            </p>
          )}
        </header>

        <StarField papers={papers} states={states} />

        <div className="sky-controls">
          <form onSubmit={search} className="search">
            <label className="threshold">
              기준값
              <input type="range" min={0} max={1} step={0.05} value={threshold}
                onChange={(e) => setThreshold(+e.target.value)} />
              <span className="num">{threshold.toFixed(2)}</span>
            </label>
            <input type="text" name="q" autoComplete="off" aria-label="연구 주제"
              placeholder="찾고 싶은 연구 주제 (예: mechanistic interpretability of LLMs)" />
            <button disabled={pending || !papers.length}>찾기</button>
          </form>
          {errors > 0 && (
            <p className="err">
              {lastError} — 판정하지 못한 묶음 {errors}개는 목록에 남겨두었습니다.
              {lastError.includes('키') && <> <Link href="/">키 바꾸기</Link></>}
            </p>
          )}
          <Matrix confs={confs} current={id} compact />
        </div>
      </section>

      <aside className="sky-panel" aria-label="남은 논문">
        <div className="panel-head">
          <span>{found ? '가장 밝은 별' : '검색하면 여기에 남은 논문이 나옵니다'}</span>
          {found && <button type="button" className="ghost" disabled={pending || !visible.length} onClick={exportCsv}>CSV</button>}
        </div>
        {found && !pending && visible.length === 0 ? (
          <p className="empty">기준값 {threshold.toFixed(2)}을 넘는 논문이 없습니다. 기준값을 낮추거나 주제를 넓혀 보세요.</p>
        ) : (
          <ul className="papers">
            {listed.map((p) => <Row key={p.id} p={p} prob={prob(p)} />)}
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
  'Miscellaneous Aspects of Machine Learning': 'MISC ML',
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

    // constellations on a grid: capped cell size so they sit close together, whole grid centered.
    // Each cell = label band on top (name, then lit/total) + the constellation centered below it.
    const k = groups.length;
    const cols = Math.max(1, Math.round(Math.sqrt((k * w) / h)));
    const rows = Math.ceil(k / cols);
    const few = k <= 3; // e.g. title-only conferences with no topics: one big constellation, use the room
    const cw = few ? w / cols : Math.min(w / cols, 220), ch = few ? h / rows : Math.min(h / rows, 215);
    const left = (w - cols * cw) / 2, top = (h - rows * ch) / 2;
    const band = 42; // label band height
    const max = groups[0][1].length;
    const rMax = Math.min(cw * 0.4, ((few ? ch : Math.min(ch, 180)) - band) * 0.36 / 0.82); // size fixed; extra row height = gap between rows
    const judged = states.some((s) => s !== -1);
    ctx.font = '500 14px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';

    groups.forEach(([topic, idx], g) => {
      const cellX = left + (g % cols) * cw, cellY = top + Math.floor(g / cols) * ch;
      const cx = cellX + cw / 2, cy = cellY + band + (ch - band) / 2;
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
      const full = topic.toUpperCase();
      ctx.fillStyle = lit ? fg : dim;
      ctx.fillText(ctx.measureText(full).width < cw - 12 ? full : SHORT[topic] ?? full.split(' ').map((w) => w[0]).join(''), cx, cellY + 16);
      if (judged) {
        ctx.fillStyle = lit ? gold : dim;
        ctx.fillText(`${lit} / ${idx.length}`, cx, cellY + 34);
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
        {p.abstract && <details><summary>초록</summary><p>{p.abstract}</p></details>}
      </div>
    </li>
  );
});
