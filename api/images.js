module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cars } = req.body || {};
  if (!cars || !Array.isArray(cars)) return res.status(400).json({ error: 'cars array required' });

  const PEXELS_KEY = process.env.PEXELS_API_KEY;

  // ── MediaWiki API — proper sized thumbnail, no URL hacks ─────────────────────
  const getWikipediaImage = async (make, model, yearFrom, generation) => {
    // Try a few title formats Wikipedia commonly uses for car articles
    const attempts = [
      generation ? `${make} ${model} (${generation})` : null,
      yearFrom   ? `${make} ${model} (${yearFrom})` : null,
      `${make} ${model}`,
      `${make} ${model} (automobile)`,
      `${make} ${model} (car)`,
    ].filter(Boolean);
    for (const title of attempts) {
      try {
        const params = new URLSearchParams({
          action: 'query',
          titles: title,
          prop: 'pageimages',
          pithumbsize: 1200,
          pilicense: 'any',
          format: 'json',
          origin: '*',
        });
        const r = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
          headers: { 'User-Agent': 'FullChat/1.0 (automotive article generator)' }
        });
        if (!r.ok) continue;
        const d = await r.json();
        const pages = Object.values(d.query?.pages || {});
        const page = pages[0];
        if (page && !page.missing && page.thumbnail?.source) {
          console.log(`Wikipedia image for "${title}":`, page.thumbnail.source);
          return { url: page.thumbnail.source, photographer: 'Wikimedia Commons' };
        }
      } catch (e) {
        console.warn('Wikipedia fetch error:', e.message);
      }
    }
    console.log(`No Wikipedia image found for ${make} ${model}`);
    return null;
  };

  // ── Wikimedia Commons search — extra images ───────────────────────────────────
  const getCommonsImages = async (make, model, yearFrom, count = 3) => {
    try {
      const yearTag = yearFrom ? ` ${yearFrom}` : '';
      const searchParams = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: `${make} ${model}${yearTag} car`,
        srnamespace: 6,
        srlimit: count * 2, // fetch extra to filter
        format: 'json',
        origin: '*',
      });
      const sr = await fetch(`https://commons.wikimedia.org/w/api.php?${searchParams}`, {
        headers: { 'User-Agent': 'FullChat/1.0' }
      });
      const sd = await sr.json();
      const hits = (sd.query?.search || []).map(h => h.title);
      if (!hits.length) return [];

      // Get image URLs for the found files
      const infoParams = new URLSearchParams({
        action: 'query',
        titles: hits.join('|'),
        prop: 'imageinfo',
        iiprop: 'url|mediatype',
        iiurlwidth: 1200,
        format: 'json',
        origin: '*',
      });
      const ir = await fetch(`https://commons.wikimedia.org/w/api.php?${infoParams}`, {
        headers: { 'User-Agent': 'FullChat/1.0' }
      });
      const id = await ir.json();

      return Object.values(id.query?.pages || {})
        .filter(p => {
          const ii = p.imageinfo?.[0];
          if (!ii) return false;
          // Only bitmap images (no SVG, OGG, etc.)
          const url = ii.thumburl || ii.url || '';
          return url && /\.(jpg|jpeg|png|webp)/i.test(url);
        })
        .map(p => ({
          url: p.imageinfo[0].thumburl || p.imageinfo[0].url,
          photographer: 'Wikimedia Commons',
        }))
        .slice(0, count);
    } catch (e) {
      console.warn('Commons fetch error:', e.message);
      return [];
    }
  };

  // ── Pexels fallback ───────────────────────────────────────────────────────────
  const searchPexels = async (make, model, year, bodyStyle) => {
    if (!PEXELS_KEY) return [];
    const queries = [
      `${make} ${model} ${year || ''}`.trim(),
      `${make} ${model} car`,
      `${make} ${model}`,
      `${make} ${bodyStyle || 'car'}`,
    ];
    for (const q of queries) {
      try {
        const r = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=3&orientation=landscape`,
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

  // ── Combine sources ───────────────────────────────────────────────────────────
  try {
    const results = await Promise.all(
      cars.slice(0, 4).map(async ({ make, model, year, bodyStyle, yearFrom, yearTo, generation }) => {
        const effectiveYear = yearFrom || year;
        const [wikiPhoto, commonsPhotos, pexelsPhotos] = await Promise.all([
          getWikipediaImage(make, model, yearFrom, generation),
          getCommonsImages(make, model, yearFrom, 2),
          searchPexels(make, model, effectiveYear, bodyStyle),
        ]);

        // Wikipedia article image first (most accurate), then Commons, then Pexels
        const photos = [
          ...(wikiPhoto ? [wikiPhoto] : []),
          ...commonsPhotos,
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
