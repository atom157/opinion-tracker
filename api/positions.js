export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { address, limit = '200' } = req.query || {};
    if (!address) return res.status(400).json({ error: 'Wallet address is required' });

    const isValid = /^0x[a-fA-F0-9]{40}$/.test(address);
    if (!isValid) return res.status(400).json({ error: 'Invalid address format' });

    const url = `https://openapi.opinion.trade/openapi/positions/user/${address}?limit=${encodeURIComponent(limit)}`;
    const response = await fetch(url, { headers: { accept: 'application/json' } });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return res.status(response.status).json({ error: `Upstream error: ${response.status}`, details: text });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: String(e?.message || e) });
  }
}
