module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cars } = req.body || {};
  if (!cars || !Array.isArray(cars)) return res.status(400).json({ error: 'cars array required' });

  const GOOGLE_KEY = process.env.GOOGLE_CSE_KEY;
  const GOOGLE_CX  = process.env.GOOGLE_CSE_ID;
  const PEXELS_KEY = process.env.PEXELS_API_KEY;

  // ── Google Custom Search Images ───────────────────────────────────────────────
  const searchGoogle = async (make, model, yearFrom, generation, count = 4) => {
    if (!GOOGLE_KEY || !GOOGLE_CX) return [];
    // Build a specific query: year + make + model + generation code
    const yearStr = yearFrom ? String(yearFrom) : '';
    const genStr  = generation && generation.length < 20 ? generation : '';
    const query   = [yearStr, make, model, genStr].filter(Boolean).join(' ');

    try {
      const params = new URLSearchParams({
        key:        GOOGLE_KEY,
        cx:         GOOGLE_CX,
        q:          query,
        searchType: 'image',
        imgType:    'photo',
        imgSize:    'large',
        num:        count,
        safe:       'off',
      });
      const r = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
      const d = await r.json();
      console.log('Google CSE response:', JSON.stringify({ query, error: d.error, itemCount: d.items?.length, cx: GOOGLE_CX?.slice(0,8), key: GOOGLE_KEY?.slice(0,10) }));
      if (d.error) {
        console.error('Google CSE error:', d.error.code, d.error.message);
        return [];
      }
      return (d.items || []).map(item => ({
        url:          item.link,
        photographer: item.displayLink,
      }));
    } catch (e) {
      console.error('Google CSE fetch error:', e.message);
      return [];
    }
  };

  // ── Pexels fallback (if Google not configured) ────────────────────────────────
  const searchPexels = async (make, model, yearFrom, bodyStyle) => {
    if (!PEXELS_KEY) return [];
    const queries = [
      `${make} ${model} ${yearFrom || ''}`.trim(),
      `${make} ${model} car`,
      `${make} ${model}`,
    ];
    for (const q of queries) {
      try {
        const r = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=4&orientation=landscape`,
          { headers: { Authorization: PEXELS_KEY } }
        );
        const d = await r.json();
        const photos = (d.photos || []).map(p => ({
          url: p.src.large || p.src.medium,
          photographer: p.photographer,
        }));
        if (photos.length) return photos;
      } catch {}
    }
    return [];
  };

  // ── Main ──────────────────────────────────────────────────────────────────────
  try {
    const results = await Promise.all(
      cars.slice(0, 4).map(async ({ make, model, year, bodyStyle, yearFrom, yearTo, generation }) => {
            const photos = (GOOGLE_KEY && GOOGLE_CX)
          ? await searchGoogle(make, model, yearFrom, generation, 4)
          : [];

        return { make, model, photos };
      })
    );
    return res.status(200).json({ results });
  } catch (err) {
    console.error('Image fetch error:', err);
    return res.status(500).json({ error: 'Image fetch failed' });
  }
};
