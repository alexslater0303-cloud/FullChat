module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cars } = req.body || {};
  if (!cars || !Array.isArray(cars)) return res.status(400).json({ error: 'cars array required' });

  // ── Wikipedia / Wikimedia Commons image search ────────────────────────────────
  const searchWikipedia = async (make, model, yearFrom, generation) => {
    try {
      // Build search query — generation code gives best specificity (e.g. "Honda Civic Type R FK2")
      const genStr  = generation && generation.length < 20 ? generation : '';
      const yearStr = yearFrom ? String(yearFrom) : '';
      const query   = [make, model, genStr, yearStr].filter(Boolean).join(' ');

      console.log('Wikipedia search query:', query);

      // Step 1: Try direct generation-specific title first (e.g. "Honda Civic Type R (FK2)")
      let title = null;
      if (genStr) {
        const directTitle = `${make} ${model} (${genStr})`;
        const directRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(directTitle)}&format=json`
        );
        const directData = await directRes.json();
        const directPage = Object.values(directData.query?.pages || {})[0];
        if (directPage && directPage.pageid && directPage.pageid !== -1) {
          title = directPage.title;
          console.log('Wikipedia: direct title match:', title);
        }
      }

      // Step 2: Try year-specific search if no direct match
      if (!title) {
        const searchRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json`
        );
        const searchData = await searchRes.json();
        const hits = searchData.query?.search || [];
        // Prefer results that contain the generation code or year in the title
        const best = hits.find(h =>
          (genStr && h.title.toLowerCase().includes(genStr.toLowerCase())) ||
          (yearStr && h.title.includes(yearStr))
        ) || hits[0];
        if (!best) { console.log('Wikipedia: no results for', query); return []; }
        title = best.title;
        console.log('Wikipedia: search match:', title);
      }

      // Step 3: Get the main thumbnail + list of images from the article
      console.log('Wikipedia: using article', title);

      const pageRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages|images&pithumbsize=1200&titles=${encodeURIComponent(title)}&imlimit=20&format=json`
      );
      const pageData = await pageRes.json();
      const page = Object.values(pageData.query?.pages || {})[0];
      if (!page) return [];

      const photos = [];

      // Main article thumbnail (most reliable — usually the infobox photo)
      if (page.thumbnail?.source) {
        photos.push({ url: page.thumbnail.source, photographer: 'Wikipedia' });
      }

      // Additional images listed in the article — resolve each to its full URL
      const imageFiles = (page.images || [])
        .map(i => i.title)
        .filter(t =>
          t.match(/\.(jpg|jpeg|png|webp)$/i) &&
          !t.match(/flag|logo|icon|arrow|map|badge|emblem|button|blank|stub|question|commons-logo/i)
        )
        .slice(0, 8); // check up to 8 candidates

      for (const fileTitle of imageFiles) {
        if (photos.length >= 4) break;
        try {
          const fileRes = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url&iiurlwidth=1200&format=json`
          );
          const fileData = await fileRes.json();
          const filePage = Object.values(fileData.query?.pages || {})[0];
          const url = filePage?.imageinfo?.[0]?.thumburl;
          if (url && !photos.some(p => p.url === url)) {
            photos.push({ url, photographer: 'Wikimedia Commons' });
          }
        } catch {}
      }

      console.log('Wikipedia: found', photos.length, 'photos for', title);
      return photos.slice(0, 4);

    } catch (e) {
      console.error('Wikipedia fetch error:', e.message);
      return [];
    }
  };

  // ── Google CSE fallback (if configured) ──────────────────────────────────────
  const GOOGLE_KEY = process.env.GOOGLE_CSE_KEY;
  const GOOGLE_CX  = process.env.GOOGLE_CSE_ID;

  const searchGoogle = async (make, model, yearFrom, generation, count = 4) => {
    if (!GOOGLE_KEY || !GOOGLE_CX) return [];
    const yearStr = yearFrom ? String(yearFrom) : '';
    const genStr  = generation && generation.length < 20 ? generation : '';
    const query   = [yearStr, make, model, genStr].filter(Boolean).join(' ');
    try {
      const params = new URLSearchParams({
        key: GOOGLE_KEY, cx: GOOGLE_CX, q: query,
        searchType: 'image', imgType: 'photo', imgSize: 'large', num: count, safe: 'off',
      });
      const r = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
      const d = await r.json();
      if (d.error) { console.error('Google CSE error:', d.error.code, d.error.message); return []; }
      return (d.items || []).map(item => ({ url: item.link, photographer: item.displayLink }));
    } catch (e) { console.error('Google CSE fetch error:', e.message); return []; }
  };

  // ── Main ─────────────────────────────────────────────────────────────────────
  try {
    const results = await Promise.all(
      cars.slice(0, 4).map(async ({ make, model, yearFrom, generation }) => {
        // Try Wikipedia first; fall back to Google CSE if available
        let photos = await searchWikipedia(make, model, yearFrom, generation);
        if (!photos.length && GOOGLE_KEY && GOOGLE_CX) {
          photos = await searchGoogle(make, model, yearFrom, generation, 4);
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
