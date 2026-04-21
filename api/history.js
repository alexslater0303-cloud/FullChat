const { supabase } = require('../lib/supabase');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const inviteCode = (req.query.inviteCode || '').trim().toUpperCase();
  if (!inviteCode) return res.status(400).json({ error: 'inviteCode required' });

  const { data, error } = await supabase
    .from('shared_articles')
    .select('id, persona, prompt, depth, article_type, created_at, article')
    .eq('invite_code', inviteCode)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('History fetch error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch history' });
  }

  // Return lightweight list — extract headline/deck from article JSONB on the server
  const articles = (data || []).map(r => ({
    id: r.id,
    persona: r.persona,
    prompt: r.prompt,
    depth: r.depth,
    article_type: r.article_type,
    created_at: r.created_at,
    headline: r.article?.headline || r.prompt || 'Untitled',
    deck: r.article?.deck || '',
  }));

  return res.status(200).json({ articles });
};
