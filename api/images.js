module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cars } = req.body || {};
  if (!cars || !Array.isArray(cars)) return res.status(400).json({ error: 'cars array required' });

  const SERPER_KEY = process.env.SERPER_API_KEY;
  if (!SERPER_KEY) return res.status(200).json({ results: cars.slice(0, 4).map(({ make, model }) => ({ make, model, photos: [] })) });

  const searchImages = async (make, model, yearFrom, generation) => {
    const genStr  = generation && generation.length < 20 ? generation : '';
    const yearStr = yearFrom ? String(yearFrom) : '';
    const query   = [yearStr, make, model, genStr].filter(Boolean).join(' ');

    try {
      const r = await fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: {
          'X-API-KEY':    SERPER_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, num: 4 }),
      });
      const d = await r.json();
      console.log('Serper images:', JSON.stringify({ query, count: d.images?.length, error: d.message }));
      return (d.images || []).slice(0, 4).map(img => ({
        url:          img.imageUrl,
        photographer: img.source,
      }));
    } catch (e) {
      console.error('Serper fetch error:', e.message);
      return [];
    }
  };

  try {
    const results = await Promise.all(
      cars.slice(0, 4).map(async ({ make, model, yearFrom, generation }) => {
        const photos = await searchImages(make, model, yearFrom, generation);
        return { make, model, photos };
      })
    );
    return res.status(200).json({ results });
  } catch (err) {
    console.error('Image fetch error:', err);
    return res.status(500).json({ error: 'Image fetch failed' });
  }
};
