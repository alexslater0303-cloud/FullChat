module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cars } = req.body || {};
  if (!cars || !Array.isArray(cars)) return res.status(400).json({ error: 'cars array required' });

  const PEXELS_KEY = process.env.PEXELS_API_KEY;

  // ── Wikipedia REST API ────────────────────────────────────────────────────────
  // Returns one accurate image from the Wikipedia article for this specific model
  const getWikipediaImage = async (make, model) => {
    const attempts = [
      `${make} ${model}`,
      `${make}_${model}`,
    ];
    for (const title of attempts) {
      try {
        const r = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
          { headers: { 'User-Agent': 'FullChat/1.0 (automotive article generator)' } }
        );
        if (!r.ok) continue;
        const d = await r.json();
        if (!d.thumbnail?.source) continue;
        // Upscale the thumbnail (Wikipedia URLs contain a size prefix we can swap out)
        const fullUrl = d.thumbnail.source.replace(/\/\d+px-/, '/1200px-');
        return { url: fullUrl, photographer: 'Wikimedia Commons' };
      } catch { /* try next */ }
    }
    return null;
  };

  // ── Pexels fallback ───────────────────────────────────────────────────────────
  const searchPexels = async (query, count = 3) => {
    if (!PEXELS_KEY) return [];
    try {
      const r = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
        { headers: { Authorization: PEXELS_KEY } }
      );
      const d = await r.json();
      return (d.photos || []).map(p => ({
        url: p.src.large || p.src.medium,
        photographer: p.photographer
      }));
    } catch { return []; }
  };

  const getPexelsPhotos = async (make, model, year, bodyStyle) => {
    // Try progressively broader queries
    const queries = [
      `${make} ${model} ${year || ''}`.trim(),
      `${make} ${model} car`,
      `${make} ${model}`,
      `${make} ${bodyStyle || 'car'}`,
    ];
    for (const q of queries) {
      const photos = await searchPexels(q, 3);
      if (photos.length > 0) return photos;
    }
    return [];
  };

  // ── Combine: Wikipedia hero + Pexels extras ───────────────────────────────────
  try {
    const results = await Promise.all(
      cars.slice(0, 4).map(async ({ make, model, year, bodyStyle }) => {
        const [wikiPhoto, pexelsPhotos] = await Promise.all([
          getWikipediaImage(make, model),
          getPexelsPhotos(make, model, year, bodyStyle),
        ]);

        // Wikipedia image goes first (most accurate), then Pexels extras
        const photos = [
          ...(wikiPhoto ? [wikiPhoto] : []),
          ...pexelsPhotos,
        ].slice(0, 4);

        return { make, model, photos };
      })
    );
    return res.status(200).json({ results });
  } catch (err) {
    console.error('Image fetch error:', err);
    return res.status(500).json({ error: 'Image fetch failed' });
  }
};
