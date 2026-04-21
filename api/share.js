const { supabase } = require('../lib/supabase');

function genId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST — save article, return share ID
  if (req.method === 'POST') {
    const { inviteCode, persona, prompt, depth, articleType, article } = req.body || {};
    if (!article) return res.status(400).json({ error: 'article required' });

    const id = genId();
    const { error } = await supabase.from('shared_articles').insert({
      id,
      invite_code: inviteCode || null,
      persona: persona || null,
      prompt: prompt || null,
      depth: depth != null ? Number(depth) : null,
      article_type: articleType || null,
      article,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Share insert error:', error.message);
      return res.status(500).json({ error: 'Failed to save shared article' });
    }

    return res.status(200).json({ id });
  }

  // GET — retrieve article by ID
  if (req.method === 'GET') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id required' });

    const { data, error } = await supabase
      .from('shared_articles')
      .select('id, persona, prompt, depth, article_type, article, created_at')
      .eq('id', id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Article not found' });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
