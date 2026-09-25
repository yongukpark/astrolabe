'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { loadKey, type Key } from '../../lib/key';

type Conf = { id: string; name: string; count: number };

export default function Conferences() {
  const router = useRouter();
  const [key, setKey] = useState<Key | null>(null);
  const [confs, setConfs] = useState<Conf[]>([]);

  useEffect(() => {
    const k = loadKey();
    if (!k) return router.replace('/');
    setKey(k);
    fetch('/data/index.json').then((r) => r.json()).then(setConfs);
  }, [router]);

  if (!key) return null;
  return (
    <main className="narrow">
      <div className="row">
        <h1>학회 선택</h1>
        <Link href="/" className="muted">{key.name} · 키 변경</Link>
      </div>
      <ul className="confs">
        {confs.map((c) => (
          <li key={c.id}>
            <Link href={`/conferences/${c.id}`}>
              <strong>{c.name}</strong>
              <span className="muted">{c.count.toLocaleString()}편</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
