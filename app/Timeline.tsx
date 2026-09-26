'use client';
import Link from 'next/link';
import type { Conf } from './Matrix';

const ROWS: [string, string][] = [['neurips', 'NeurIPS'], ['iclr', 'ICLR'], ['icml', 'ICML']];

// Conferences as planets on a month axis: position = when it was held, size = accepted papers.
export function Timeline({ confs }: { confs: Conf[] }) {
  if (!confs.length) return null;
  const y0 = Math.min(...confs.map((c) => c.year));
  const years = Math.max(...confs.map((c) => c.year)) - y0 + 1;
  const x = (year: number, month: number) => `${((year - y0) * 12 + month - 0.5) / (years * 12) * 100}%`;
  const max = Math.max(...confs.map((c) => c.count ?? 0));
  const now = new Date();
  const today = x(now.getFullYear(), now.getMonth() + now.getDate() / 31);

  return (
    <div className="timeline-scroll">
      <div className="timeline">
        <div className="tl-axis">
          {Array.from({ length: years }, (_, i) => (
            <span key={i} className="tl-year" style={{ left: x(y0 + i, 6.5) }}>{y0 + i}</span>
          ))}
          {now.getFullYear() - y0 < years && <span className="tl-today" style={{ left: today }} />}
        </div>
        {ROWS.map(([conf, name]) => (
          <div key={conf} className="tl-row">
            <span className="tl-name">{name}</span>
            <div className="tl-orbit">
              {confs.filter((c) => c.conf === conf).map((c) => {
                const d = c.pending ? 40 : 18 + 34 * Math.sqrt((c.count ?? 0) / max);
                const label = <><b>{c.pending ? c.pending.slice(5).replace('-', '.') : c.count!.toLocaleString()}</b><small>{c.place}</small></>;
                return c.pending ? (
                  <span key={c.id} className="tl-planet pending" style={{ left: x(c.year, c.month!) }} title={c.note}>
                    <i style={{ width: d, height: d, marginTop: -d / 2 }} />{label}
                  </span>
                ) : (
                  <Link key={c.id} href={`/conferences/${c.id}`} className="tl-planet" style={{ left: x(c.year, c.month!) }} aria-label={`${c.name}, ${c.place}, ${c.count}편`}>
                    <i style={{ width: d, height: d, marginTop: -d / 2 }} />{label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
