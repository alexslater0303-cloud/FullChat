const { supabase } = require('../lib/supabase');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const { id, convo } = req.body || {};
  if (!id || !Array.isArray(convo)) return res.status(400).json({ error: 'id and convo required' });

  // Fetch existing article, merge convo into it
  const { data, error: fetchErr } = await supabase
    .from('shared_articles')
    .select('article')
    .eq('id', id)
    .single();

  if (fetchErr || !data) return res.status(404).json({ error: 'Article not found' });

  const { error } = await supabase
    .from('shared_articles')
    .update({ article: { ...data.article, _convo: convo } })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
};
