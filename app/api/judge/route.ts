import { readFile } from 'node:fs/promises';
import path from 'node:path';

type Paper = { id: string; title: string; abstract: string };

// Same Jev request shape on both; only endpoint + model name differ
const PROVIDERS = {
  typesafe: { url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-latest' },
  openrouter: { url: 'https://openrouter.ai/api/alpha/decisions', model: 'typesafe/jev-1.13' },
};
// Client batches by text size (≈53k tokens); this is only a sanity cap. Jev itself rejects >64k tokens.
const MAX_BATCH = 400;

const cache = new Map<string, Promise<Map<string, Paper>>>();
const load = (conf: string) => {
  if (!cache.has(conf))
    cache.set(conf, readFile(path.join(process.cwd(), 'public/data', `${conf}.json`), 'utf8')
      .then((s) => new Map((JSON.parse(s) as Paper[]).map((p) => [p.id, p])))
      .catch((e) => { cache.delete(conf); throw e; }));
  return cache.get(conf)!;
};

export async function POST(req: Request) {
  const provider = PROVIDERS[req.headers.get('x-provider') as keyof typeof PROVIDERS];
  const apiKey = req.headers.get('x-api-key');
  if (!provider || !apiKey) return Response.json({ error: 'missing provider or key' }, { status: 401 });

  const { conf, query, ids } = await req.json();
  if (typeof conf !== 'string' || !/^[a-z]+\d{4}$/.test(conf)) return Response.json({ error: 'bad conf' }, { status: 400 });
  if (typeof query !== 'string' || !query.trim() || query.length > 2000)
    return Response.json({ error: 'bad query' }, { status: 400 });
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BATCH)
    return Response.json({ error: `ids: 1..${MAX_BATCH}` }, { status: 400 });

  const byId = await load(conf).catch(() => null);
  if (!byId) return Response.json({ error: 'unknown conf' }, { status: 404 });
  const batch = ids.map((id) => byId.get(id)).filter((p) => p !== undefined);

  const res = await fetch(provider.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: provider.model,
      state: `Researcher's interest: ${query}`,
      questions: Object.fromEntries(
        batch.map((p, i) => [
          `p${i}`,
          {
            type: 'noul',
            instructions: `Is this paper relevant to the researcher's interest described in the state?\n\nTitle: ${p.title}\n\nAbstract: ${p.abstract}`,
          },
        ]),
      ),
    }),
  });
  // pass 401/402/429 through so the page can say "bad key" / "out of credit" / "slow down"
  if (!res.ok) return Response.json({ error: (await res.text()).slice(0, 300) }, { status: res.status });

  const { answers } = await res.json();
  return Response.json(Object.fromEntries(batch.map((p, i) => [p.id, answers[`p${i}`].noul])));
}
