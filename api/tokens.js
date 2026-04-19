const { supabase } = require('../lib/supabase');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Invite code required' });

  const normCode = code.trim().toUpperCase();

  if (action === 'check') {
    const { data, error } = await supabase
      .from('testers')
      .select('id, name, tokens_remaining, tokens_used')
      .eq('invite_code', normCode)
      .eq('active', true)
      .single();

    if (error || !data) return res.status(403).json({ error: 'Invalid or inactive invite code' });

    return res.status(200).json({
      valid: true,
      name: data.name,
      tokens_remaining: data.tokens_remaining,
      tokens_used: data.tokens_used || 0
    });
  }

  return res.status(400).json({ error: 'Unknown action' });
};
