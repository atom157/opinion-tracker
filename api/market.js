export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'Market ID is required' });
  }

  try {
    console.log(`Fetching market data for ID: ${id}`);
    const response = await fetch(
      `https://openapi.opinion.trade/openapi/market/${id}`,
      {
        headers: {
          'apikey': 'ehtBldzeqaB88gW0YeWcz6ku5M2R9KO8',
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Market API error:', error);
    return res.status(500).json({ 
      error: error.message,
      code: -1,
      result: null
    });
  }
}
