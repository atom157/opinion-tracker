export default async function handler(req, res) {
  const { address, limit = 100 } = req.query;
  
  if (!address) {
    return res.status(400).json({ error: 'Address is required' });
  }

  try {
    const response = await fetch(
      `https://openapi.opinion.trade/openapi/trade/user/${address}?limit=${limit}`,
      {
        headers: {
          'apikey': 'ehtBldzeqaB88gW0YeWcz6ku5M2R9KO8',
          'Accept': 'application/json'
        }
      }
    );

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
