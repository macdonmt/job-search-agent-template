const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function extractKeywords(jdText) {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Extract the 15 most important keywords and phrases from this job description. Focus on: methodologies, tools, domain terms, role competencies, and certifications. Return only a JSON array of lowercase strings — no explanation.

${jdText.slice(0, 4000)}

Return only valid JSON: ["keyword1", "keyword2", ...]`,
    }],
  });

  const raw = message.content[0].text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
  const keywords = JSON.parse(raw);
  return Array.isArray(keywords) ? keywords.slice(0, 20) : [];
}

function countMatches(keywords, text) {
  const lower = text.toLowerCase();
  return keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
}

/**
 * Scores keyword coverage of base vs. tailored resume against the JD.
 * Returns null if jdText is empty or scoring fails.
 *
 * @param {string} jdText
 * @param {string} baseText - flat text of the base resume
 * @param {string} tailoredText - flat text after tailoring changes applied
 * @returns {Promise<{keywords: string[], baseScore: number, tailoredScore: number, total: number} | null>}
 */
async function scoreKeywords(jdText, baseText, tailoredText) {
  if (!jdText || !jdText.trim()) return null;

  try {
    const keywords = await extractKeywords(jdText);
    if (!keywords.length) return null;
    const baseScore = countMatches(keywords, baseText);
    const tailoredScore = countMatches(keywords, tailoredText);
    return { keywords, baseScore, tailoredScore, total: keywords.length };
  } catch (err) {
    console.error('ATS scoring failed:', err.message);
    return null;
  }
}

module.exports = { scoreKeywords };
