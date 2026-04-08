// api/tokens.js
// Handles: checking a tester's invite code, returning their token balance,
// and deducting tokens after a successful generation.

const { supabase } = require('../lib/supabase');

module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, code } = req.body || {};

  if (!code) {
    return res.status(400).json({ error: 'Invite code required' });
  }

  // Normalise code — uppercase, trim whitespace
  const normCode = code.trim().toUpperCase();

  // ── CHECK: validate code and return balance ──────────────────────────────
  if (action === 'check') {
    const { data, error } = await supabase
      .from('testers')
      .select('id, name, tokens_remaining, tokens_used')
      .eq('invite_code', normCode)
      .eq('active', true)
      .single();

    if (error || !data) {
      return res.status(403).json({ error: 'Invalid or inactive invite code' });
    }

    return res.status(200).json({
      valid: true,
      name: data.name,
      tokens_remaining: data.tokens_remaining,
      tokens_used: data.tokens_used
    });
  }

  // ── DEDUCT: subtract tokens after a generation ───────────────────────────
  if (action === 'deduct') {
    const { amount } = req.body;

    if (!amount || typeof amount !== 'number') {
      return res.status(400).json({ error: 'Amount required' });
    }

    // Get current balance first
    const { data: tester, error: fetchError } = await supabase
      .from('testers')
      .select('id, tokens_remaining')
      .eq('invite_code', normCode)
      .eq('active', true)
      .single();

    if (fetchError || !tester) {
      return res.status(403).json({ error: 'Invalid code' });
    }

    if (tester.tokens_remaining < amount) {
      return res.status(402).json({ error: 'Insufficient tokens' });
    }

    const { error: updateError } = await supabase
      .from('testers')
      .update({
        tokens_remaining: tester.tokens_remaining - amount,
        tokens_used: supabase.raw(`tokens_used + ${amount}`)
      })
      .eq('id', tester.id);

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update token balance' });
    }

    return res.status(200).json({
      success: true,
      tokens_remaining: tester.tokens_remaining - amount
    });
  }

  return res.status(400).json({ error: 'Unknown action' });
};
