const { supabase } = require('../lib/supabase');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = req.query.key || '';
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  try {
    const [testersRes, generationsRes, feedbackRes, articlesRes] = await Promise.all([
      supabase.from('testers').select('id, name, invite_code, tokens_remaining, tokens_used, active').order('tokens_used', { ascending: false }),
      supabase.from('generations').select('tester_id, persona, tokens_used, article_headline, created_at').order('created_at', { ascending: false }).limit(200),
      supabase.from('feedback').select('invite_code, persona, prompt, headline, article_type, rating, comment, created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('shared_articles').select('id, invite_code, persona, prompt, article_type, created_at').order('created_at', { ascending: false }).limit(50),
    ]);

    const testers = testersRes.data || [];
    const generations = generationsRes.data || [];
    const feedback = feedbackRes.data || [];
    const articles = articlesRes.data || [];

    // Aggregate generation counts per tester
    const genCountByTester = {};
    generations.forEach(g => {
      genCountByTester[g.tester_id] = (genCountByTester[g.tester_id] || 0) + 1;
    });

    // Persona breakdown
    const personaCounts = {};
    generations.forEach(g => {
      personaCounts[g.persona] = (personaCounts[g.persona] || 0) + 1;
    });

    // Feedback stats
    const thumbsUp = feedback.filter(f => f.rating === 'up').length;
    const thumbsDown = feedback.filter(f => f.rating === 'down').length;

    // Total tokens consumed
    const totalTokens = testers.reduce((s, t) => s + (t.tokens_used || 0), 0);

    return res.status(200).json({
      summary: {
        totalTesters: testers.filter(t => t.active).length,
        totalGenerations: generations.length,
        totalTokens,
        thumbsUp,
        thumbsDown,
        satisfactionPct: thumbsUp + thumbsDown > 0 ? Math.round((thumbsUp / (thumbsUp + thumbsDown)) * 100) : null,
      },
      personaCounts,
      testers: testers.map(t => ({
        ...t,
        generationCount: genCountByTester[t.id] || 0,
      })),
      feedback: feedback.slice(0, 50),
      recentArticles: articles.slice(0, 20),
    });
  } catch (e) {
    console.error('Admin error:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
};
