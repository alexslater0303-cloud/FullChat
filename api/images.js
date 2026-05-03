const { supabase } = require('../lib/supabase');

const CACHE_TTL_DAYS = 30;

function buildCacheKey(make, model, yearFrom, generation) {
  const parts = [make, model, yearFrom || '', generation || '']
    .map(s => String(s).trim().toLowerCase().replace(/\s+/g, '-'));
  return parts.join('|');
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cars } = req.body || {};
  if (!cars || !Array.isArray(cars)) return res.status(400).json({ error: 'cars array required' });

  const SERPER_KEY = process.env.SERPER_API_KEY;
  if (!SERPER_KEY) return res.status(200).json({ results: cars.slice(0, 10).map(({ make, model }) => ({ make, model, photos: [] })) });

  const cacheExpiry = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const searchImages = async (make, model, yearFrom, generation) => {
    const genStr  = generation && generation.length < 20 ? generation : '';
    const yearStr = yearFrom ? String(yearFrom) : '';
    const query   = [yearStr, make, model, genStr].filter(Boolean).join(' ');

    try {
      const r = await fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, num: 4 }),
      });
      const d = await r.json();
      console.log('Serper images:', JSON.stringify({ query, count: d.images?.length, error: d.message }));
      return (d.images || []).slice(0, 10).map(img => ({ url: img.imageUrl, photographer: img.source }));
    } catch (e) {
      console.error('Serper fetch error:', e.message);
      return [];
    }
  };

  try {
    const results = await Promise.all(
      cars.slice(0, 10).map(async ({ make, model, yearFrom, generation }) => {
        const key = buildCacheKey(make, model, yearFrom, generation);

        // Check cache first
        try {
          const { data: cached } = await supabase
            .from('image_cache')
            .select('photos')
            .eq('cache_key', key)
            .gte('created_at', cacheExpiry)
            .single();

          if (cached?.photos?.length) {
            console.log('Image cache hit:', key);
            return { make, model, photos: cached.photos };
          }
        } catch (_) {}

        // Cache miss — fetch from Serper
        const photos = await searchImages(make, model, yearFrom, generation);

        // Store in cache (upsert so re-runs refresh the TTL)
        if (photos.length) {
          try {
            await supabase.from('image_cache').upsert({
              cache_key: key,
              photos,
              created_at: new Date().toISOString(),
            }, { onConflict: 'cache_key' });
          } catch (cacheErr) {
            console.warn('Image cache write failed:', cacheErr.message);
          }
        }

        return { make, model, photos };
      })
    );
    return res.status(200).json({ results });
  } catch (err) {
    console.error('Image fetch error:', err);
    return res.status(500).json({ error: 'Image fetch failed' });
  }
};
