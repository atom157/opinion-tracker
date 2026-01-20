export default async function handler(req, res) {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'Market ID is required' });
  }

  try {
    const response = await fetch(
      `https://openapi.opinion.trade/openapi/market/${id}`,
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
