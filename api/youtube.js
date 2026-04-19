module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cars } = req.body || {};
  if (!cars || !Array.isArray(cars)) return res.status(400).json({ error: 'cars array required' });

  const KEY = process.env.YOUTUBE_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'YOUTUBE_API_KEY not configured' });

  try {
    const results = await Promise.all(
      cars.slice(0, 4).map(async ({ make, model }) => {
        const q = encodeURIComponent(`${make} ${model} full review`);
        const r = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&maxResults=1&key=${KEY}`
        );
        const d = await r.json();
        const item = d.items?.[0];
        if (!item) return { make, model, video: null };
        return {
          make, model,
          video: {
            id: item.id.videoId,
            title: item.snippet.title,
            channel: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails?.medium?.url
          }
        };
      })
    );
    return res.status(200).json({ results });
  } catch (err) {
    console.error('YouTube error:', err);
    return res.status(500).json({ error: 'YouTube fetch failed' });
  }
};
