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
      <span className="wordmark">Find Papers</span>
      <h1 style={{ marginTop: 10 }}>학회 논문을 별자리로</h1>
      <p className="lede">학회 채택 논문 전체를 Jev가 초록 단위로 읽고, 내 연구 주제에 맞는 것만 남깁니다.</p>

      {keys.length > 0 && (
        <ul className="keys" aria-label="저장된 키">
          {keys.map((k, i) => (
            <li key={i}>
              <span className="who">
                {k.name}
                <small>{PROVIDER_NAME[k.provider]} · …{k.apiKey.slice(-4)}</small>
              </span>
              <button type="button" onClick={() => start(i)}>이 키로 시작</button>
              <button type="button" className="ghost" aria-label={`${k.name} 삭제`}
                onClick={() => { removeKey(i); setKeys(loadKeys()); }}>삭제</button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="form" aria-label="새 키 추가">
        <div className="segmented" role="radiogroup" aria-label="키 제공자">
          {(Object.keys(PROVIDER_NAME) as Provider[]).map((p) => (
            <label key={p}>
              <input type="radio" name="provider" checked={provider === p} onChange={() => setProvider(p)} />
              {PROVIDER_NAME[p]}
            </label>
          ))}
        </div>
        <input type="text" name="name" autoComplete="off" placeholder="별명 (선택)" aria-label="키 별명" />
        <input type="password" name="key" autoComplete="off" aria-label="API 키"
          placeholder={provider === 'openrouter' ? 'OpenRouter 키 (sk-or-…)' : 'TypeSafe 키'} />
        <div className="form-foot">
          <a href={KEY_URL[provider]} target="_blank" rel="noreferrer">{PROVIDER_NAME[provider]} 키 발급 ↗</a>
          <button>키 저장하고 시작</button>
        </div>
      </form>
    </main>
  );
}
