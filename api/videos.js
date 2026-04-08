// api/videos.js
// Takes an array of search terms from the generated article,
// queries YouTube Data API v3, returns top video per car.

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { searchTerms } = req.body || {};

  if (!searchTerms || !Array.isArray(searchTerms) || searchTerms.length === 0) {
    return res.status(400).json({ error: 'searchTerms array required' });
  }

  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  if (!YOUTUBE_API_KEY) {
    return res.status(500).json({ error: 'YouTube API key not configured' });
  }

  try {
    // Fetch one video per search term in parallel
    const videoPromises = searchTerms.slice(0, 4).map(async (term) => {
      const query = encodeURIComponent(`${term} review`);
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&videoCategoryId=2&maxResults=5&order=viewCount&key=${YOUTUBE_API_KEY}`;

      const response = await fetch(url);
      const data = await response.json();

      if (!data.items || data.items.length === 0) return null;

      // Pick first result — already sorted by view count
      const video = data.items[0];
      return {
        searchTerm: term,
        videoId: video.id.videoId,
        title: video.snippet.title,
        channel: video.snippet.channelTitle,
        thumbnail: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url,
        url: `https://www.youtube.com/watch?v=${video.id.videoId}`
      };
    });

    const videos = (await Promise.all(videoPromises)).filter(Boolean);

    return res.status(200).json({ videos });

  } catch (err) {
    console.error('YouTube API error:', err);
    return res.status(500).json({ error: 'Failed to fetch videos' });
  }
};
