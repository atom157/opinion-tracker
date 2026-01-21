export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { address, limit = 50 } = req.query;
  
  if (!address) {
    return res.status(400).json({ error: 'Address is required' });
  }

  try {
    console.log(`Fetching positions for address: ${address}`);
    const response = await fetch(
      `https://openapi.opinion.trade/openapi/positions/user/${address}?limit=${limit}`,
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
    console.log(`Positions response:`, data);
    return res.status(200).json(data);
  } catch (error) {
    console.error('Positions API error:', error);
    return res.status(500).json({ 
      error: error.message,
      code: -1,
      result: null
    });
  }
}
