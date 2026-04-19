module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cars } = req.body || {};
  if (!cars || !Array.isArray(cars)) return res.status(400).json({ error: 'cars array required' });

  const KEY = process.env.PEXELS_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'PEXELS_API_KEY not configured' });

  const searchPexels = async (query) => {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=4&orientation=landscape`,
      { headers: { Authorization: KEY } }
    );
    const d = await r.json();
    return (d.photos || []).map(p => ({
      url: p.src.large || p.src.medium,
      photographer: p.photographer
    }));
  };

  try {
    const results = await Promise.all(
      cars.slice(0, 4).map(async ({ make, model, year, bodyStyle }) => {
        // Try increasingly specific then broader queries until we get results
        const queries = [
          `${make} ${model} ${year || ''} ${bodyStyle || ''}`.trim(),
          `${make} ${model} car`,
          `${make} ${model}`,
          `${make} automobile`
        ];

        let photos = [];
        for (const q of queries) {
          photos = await searchPexels(q);
          if (photos.length > 0) break;
        }

        return { make, model, photos };
      })
    );
    return res.status(200).json({ results });
  } catch (err) {
    console.error('Pexels error:', err);
    return res.status(500).json({ error: 'Image fetch failed' });
  }
};
