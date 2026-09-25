// /api/judge reads paper JSON from disk; ship it with the serverless function on Vercel
export default {
  outputFileTracingIncludes: { '/api/judge': ['./public/data/*.json'] },
};
