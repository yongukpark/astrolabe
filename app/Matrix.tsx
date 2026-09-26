'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export type Conf = {
  id: string; conf: string; year: number; name: string; count?: number;
  place?: string; month?: number; pending?: string; note?: string;
};

const ROWS: [string, string][] = [['neurips', 'NeurIPS'], ['iclr', 'ICLR'], ['icml', 'ICML']];

export function useConfs() {
  const [confs, setConfs] = useState<Conf[]>([]);
  useEffect(() => {
    fetch('/data/index.json').then((r) => r.json()).then(setConfs);
  }, []);
  return confs;
}

// Conference × year. Released editions link to their search page; pending ones show the release date.
export function Matrix({ confs, current, compact }: { confs: Conf[]; current?: string; compact?: boolean }) {
  const years = [...new Set(confs.map((c) => c.year))].sort();
  const cell = (conf: string, year: number) => confs.find((c) => c.conf === conf && c.year === year);
  return (
    <div className={compact ? 'matrix compact' : 'matrix'} style={{ gridTemplateColumns: `auto repeat(${years.length}, 1fr)` }}>
      <span />
      {years.map((y) => <span key={y} className="year">{compact ? `'${String(y).slice(2)}` : y}</span>)}
      {ROWS.map(([conf, name]) => (
        <Row key={conf} name={name}>
          {years.map((y) => {
            const c = cell(conf, y);
            if (!c) return <span key={y} className="cell empty">—</span>;
            if (c.pending)
              return (
                <span key={y} className="cell pending" title={c.note}>
                  {compact ? c.pending.slice(5).replace('-', '.') : <><b>{c.pending.slice(5).replace('-', '.')} 학회 개막</b><small>{c.note}</small></>}
                </span>
              );
            return (
              <Link key={y} href={`/conferences/${c.id}`} className={c.id === current ? 'cell on' : 'cell'} aria-current={c.id === current ? 'page' : undefined}>
                {compact ? c.count!.toLocaleString() : <><b>{c.count!.toLocaleString()}</b><small>편</small></>}
              </Link>
            );
          })}
        </Row>
      ))}
    </div>
  );
}

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return <><span className="conf">{name}</span>{children}</>;
}
