const { supabase } = require('../lib/supabase');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { inviteCode, persona, prompt, depth, headline, articleType, rating, comment } = req.body || {};

  if (!inviteCode || !rating) return res.status(400).json({ error: 'inviteCode and rating required' });
  if (!['up', 'down'].includes(rating)) return res.status(400).json({ error: 'rating must be up or down' });

  try {
    const { error } = await supabase.from('feedback').insert({
      invite_code: inviteCode.trim().toUpperCase(),
      persona: persona || null,
      prompt: prompt || null,
      depth: depth != null ? Number(depth) : null,
      headline: headline || null,
      article_type: articleType || null,
      rating,
      comment: comment || null,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Feedback insert error:', error.message);
      return res.status(500).json({ error: 'Failed to save feedback' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Feedback error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
};
