const Anthropic = require('@anthropic-ai/sdk');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const FALLBACK = [
    'Best hot hatches under 15k',
    'Best used sports cars under 20k',
    'AWD EVs under 20k',
    'Japanese performance cars under 30k',
    'Deep dive on the Honda Civic Type R',
    'Deep dive on the Toyota GR86',
  ];

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(200).json({ chips: FALLBACK, source: 'fallback-no-key' });

  const now = new Date();
  const weekSeed = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 604800000);
  const month = now.toLocaleString('en-GB', { month: 'long' });
  const year = now.getFullYear();

  try {
    const anthropic = new Anthropic({ apiKey: KEY });
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: 'Generate 8 prompt chips for a UK car article generator. ' + month + ' ' + year + ', seed ' + weekSeed + '. Mix comparisons ("Best hot hatches under 15k") and deep dives ("Deep dive on the Golf R"). UK market. Prices as "15k" not symbols. Vary by seed. Return ONLY a JSON array of 8 strings, no other text: ["chip1","chip2",...]'
      }]
    });

    const raw = msg.content[0].text;
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('no array in: ' + raw.slice(0, 100));

    const chips = JSON.parse(match[0]);
    if (!Array.isArray(chips) || chips.length < 4) throw new Error('bad shape');

    return res.status(200).json({ chips: chips.slice(0, 8), source: 'claude' });
  } catch (e) {
    console.error('Chips error:', e.message);
    return res.status(200).json({ chips: FALLBACK, source: 'fallback-error', error: e.message });
  }
};
