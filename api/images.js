// Pexels image search — returns up to 4 photos per car
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cars } = req.body || {};
  if (!cars || !Array.isArray(cars)) return res.status(400).json({ error: 'cars array required' });

  const PEXELS_KEY = process.env.PEXELS_API_KEY;
  if (!PEXELS_KEY) return res.status(500).json({ error: 'PEXELS_API_KEY not configured' });

  try {
    const results = await Promise.all(
      cars.slice(0, 4).map(async ({ make, model }) => {
        const query = encodeURIComponent(`${make} ${model} car`);
        const r = await fetch(
          `https://api.pexels.com/v1/search?query=${query}&per_page=4&orientation=landscape`,
          { headers: { Authorization: PEXELS_KEY } }
        );
        const data = await r.json();
        const photos = (data.photos || []).map(p => ({
          url: p.src.large || p.src.medium,
          thumb: p.src.medium,
          photographer: p.photographer
        }));
        return { make, model, photos };
      })
    );
    return res.status(200).json({ results });
  } catch (err) {
    console.error('Pexels error:', err);
    return res.status(500).json({ error: 'Image fetch failed' });
  }
};
