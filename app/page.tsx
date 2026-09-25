'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { addKey, loadKeys, removeKey, selectKey, PROVIDER_NAME, type Key, type Provider } from '../lib/key';

const KEY_URL: Record<Provider, string> = {
  typesafe: 'https://console.typesafe.ai/keys',
  openrouter: 'https://openrouter.ai/keys',
};

export default function KeyPage() {
  const router = useRouter();
  const [keys, setKeys] = useState<Key[]>([]);
  const [provider, setProvider] = useState<Provider>('openrouter');

  useEffect(() => setKeys(loadKeys()), []);

  function start(i: number) {
    selectKey(i);
    router.push('/conferences');
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const apiKey = String(f.get('key') ?? '').trim();
    if (!apiKey) return;
    const name = String(f.get('name') ?? '').trim() || `${PROVIDER_NAME[provider]} …${apiKey.slice(-4)}`;
    addKey({ name, provider, apiKey });
    router.push('/conferences');
  }

  return (
    <main className="narrow">
      <h1>Find Papers</h1>
      <p className="muted">학회 논문을 Jev로 걸러봅니다. 사용할 Jev API 키를 넣어주세요. 키는 이 브라우저에만 저장됩니다.</p>

      {keys.length > 0 && (
        <ul className="keys">
          {keys.map((k, i) => (
            <li key={i}>
              <span><strong>{k.name}</strong> <span className="muted">{PROVIDER_NAME[k.provider]} · …{k.apiKey.slice(-4)}</span></span>
              <button type="button" onClick={() => start(i)}>이 키로 시작</button>
              <button type="button" className="ghost" onClick={() => { removeKey(i); setKeys(loadKeys()); }}>삭제</button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="stack">
        <div className="choices">
          {(Object.keys(PROVIDER_NAME) as Provider[]).map((p) => (
            <label key={p} className={provider === p ? 'choice on' : 'choice'}>
              <input type="radio" name="provider" checked={provider === p} onChange={() => setProvider(p)} />
              {PROVIDER_NAME[p]}
            </label>
          ))}
        </div>
        <input type="text" name="name" autoComplete="off" placeholder="별명 (선택, 예: 개인 키)" />
        <input type="password" name="key" autoComplete="off"
          placeholder={provider === 'openrouter' ? 'sk-or-…' : 'TypeSafe API key'} />
        <div className="row">
          <a href={KEY_URL[provider]} target="_blank" rel="noreferrer" className="muted">{PROVIDER_NAME[provider]} 키 발급 →</a>
          <button>저장하고 시작</button>
        </div>
      </form>
    </main>
  );
}
