'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { loadKey, type Key } from '../../lib/key';
import { useConfs } from '../Matrix';
import { Timeline } from '../Timeline';

export default function Conferences() {
  const router = useRouter();
  const [key, setKey] = useState<Key | null>(null);
  const confs = useConfs();

  useEffect(() => {
    const k = loadKey();
    if (!k) return router.replace('/');
    setKey(k);
  }, [router]);

  if (!key) return null;
  return (
    <main className="observatory">
      <nav className="top">
        <span className="wordmark">Astrolabe <em>for your research</em></span>
        <Link href="/">{key.name}</Link>
      </nav>
      <Timeline confs={confs} />
    </main>
  );
}
