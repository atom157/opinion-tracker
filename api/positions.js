export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { address, limit = '50' } = req.query || {};
  if (!address) return res.status(400).json({ error: 'Address is required' });

  const safeAddress = String(address).trim();
  const safeLimit = String(limit).trim();

  // Upstream priority:
  // 1) opinion-trade.space (works well from browsers; no API key)
  // 2) openapi.opinion.trade (requires apikey; kept as fallback)
  const upstreams = [
    {
      name: 'opinion-trade.space',
      url: `https://www.opinion-trade.space/api/positions?address=${encodeURIComponent(safeAddress)}`,
      headers: { 'Accept': 'application/json' }
    },
    {
      name: 'openapi.opinion.trade',
      url: `https://openapi.opinion.trade/openapi/positions/user/${encodeURIComponent(safeAddress)}?limit=${encodeURIComponent(safeLimit)}`,
      headers: { 'apikey': 'ehtBldzeqaB88gW0YeWcz6ku5M2R9KO8', 'Accept': 'application/json' }
    }
  ];

  try {
    let lastErr = null;

    for (const up of upstreams) {
      try {
        const r = await fetch(up.url, { headers: up.headers });
        const text = await r.text();

        // Some upstreams may return HTML on errors; try to parse JSON safely.
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }

        if (r.ok) {
          return res.status(200).json(data);
        }

        // If we got a non-OK response, keep the error and try next upstream.
        lastErr = { upstream: up.name, status: r.status, body: data };
      } catch (e) {
        lastErr = { upstream: up.name, status: 0, body: { message: String(e?.message || e) } };
      }
    }

    return res.status(502).json({ error: 'Upstream request failed', details: lastErr });
  } catch (error) {
    return res.status(500).json({ error: 'Server error', details: String(error?.message || error) });
  }
}
