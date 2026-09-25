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
    <main>
      <nav className="top">
        <span className="wordmark">Find Papers</span>
        <Link href="/">{key.name} · 키 변경</Link>
      </nav>
      <h1 style={{ marginBottom: 20 }}>어느 학회를 거를까요?</h1>
      <ul className="confs">
        {confs.map((c) => (
          <li key={c.id}>
            <Link href={`/conferences/${c.id}`}>
              <strong>{c.name}</strong>
              <span className="mono muted">{c.count.toLocaleString()}편</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
