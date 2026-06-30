const Anthropic = require('@anthropic-ai/sdk');
const { CAREER_FACTS } = require('./career-facts');

const sanitizeDashes = s => s.replace(/–/g, '-').replace(/—/g, '-');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Define one profile summary per base resume version you maintain.
// Keep these aligned with the framing of each corresponding Google Doc resume.
const PROFILES = {
  'default': `[One-paragraph professional summary for your default resume framing — years of experience, domain, scale, and headline credentials.]`,
  // Add additional framings as needed, e.g.:
  // 'tpm': `[Alternate summary framing the same background toward a different target role.]`,
};

// Editable resume content per base version — exact text from your Google Drive documents.
// Includes all sections the tailoring pass is allowed to modify. Keep in sync with base resumes.
// Education, certifications, and dates are typically off-limits and intentionally excluded.
const RESUME_CONTENT = {
  'default': {
    profile: PROFILES['default'],
    expertise: [
      '[Skill/expertise area 1]', '[Skill/expertise area 2]', '[Skill/expertise area 3]',
      '[Skill/expertise area 4]', '[Skill/expertise area 5]',
    ],
    bullets: [
      // [Company/Role 1]
      '[Resume bullet — exact text from your base resume, including specific metrics]',
      '[Resume bullet]',
      // [Company/Role 2]
      '[Resume bullet]',
      '[Resume bullet]',
      // Add one comment block per role/employer to keep bullets organized and
      // make it easy for the tailoring prompt to reference "this section" in edits.
    ],
  },
  // Add additional base resume versions here following the same shape, e.g.:
  // 'tpm': { profile: PROFILES['tpm'], expertise: [...], bullets: [...] },
};

/**
 * Stage 1 — Gap analysis (Sonnet 4.6).
 * Picks the base resume and identifies which JD requirements are covered vs. missing.
 */
async function analyzeGaps(jdText, title, company) {
  const baseVersions = Object.keys(PROFILES);
  const versionDescriptions = baseVersions
    .map(key => `- "${key}": ${PROFILES[key]}`)
    .join('\n');

  const prompt = `You are helping a candidate tailor his resume for a specific job application.

Job: ${title} at ${company}
${jdText ? `\nJob description:\n${jdText}\n` : '(No JD available — base your decision on the job title only.)'}

The candidate has the following resume version(s):
${versionDescriptions}

Task:
1. Choose the better base from: ${baseVersions.map(k => `"${k}"`).join(', ')}
2. Extract the top 10 requirements from the JD with a priority (high/medium/low) and assess current coverage (strong/partial/missing) based on the chosen profile and typical resume content for this background.

Return only valid JSON:
{
  "baseResume": ${baseVersions.map(k => `"${k}"`).join(' or ')},
  "reasoning": "one sentence",
  "requirements": [
    { "text": "requirement or keyword", "priority": "high|medium|low", "coverage": "strong|partial|missing" }
  ]
}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
  const result = JSON.parse(raw);
  const fallback = baseVersions[0] || 'default';
  return {
    baseResume: baseVersions.includes(result.baseResume) ? result.baseResume : fallback,
    reasoning: result.reasoning || '',
    requirements: Array.isArray(result.requirements) ? result.requirements : [],
  };
}

/**
 * Stage 2 — Targeted edits (Opus 4.8).
 * Uses the gap analysis to generate aggressive, specific find/replace pairs.
 */
async function generateEdits(analysis, jdText, title, company) {
  const content = RESUME_CONTENT[analysis.baseResume];
  const gaps = (analysis.requirements || [])
    .filter(r => r.coverage !== 'strong')
    .slice(0, 8);

  const resumeRef = [
    `[PROFILE]\n${content.profile}`,
    `[AREAS OF EXPERTISE]\n${content.expertise.join(' | ')}`,
    `[BULLETS]\n${content.bullets.map(b => `• ${b}`).join('\n')}`,
  ].join('\n\n');

  const gapList = gaps.map(r => `- ${r.text} (${r.priority} priority, ${r.coverage})`).join('\n');

  const prompt = `You are tailoring a candidate's resume for a specific role. You have authority to make substantial, targeted edits.

Job: ${title} at ${company}
${jdText ? `\nJob description:\n${jdText}\n` : ''}

Gap analysis identified these uncovered or partially-covered requirements:
${gapList || '(No specific gaps — make targeted improvements to match the JD language.)'}

RESUME CONTENT (exact text — your find strings must match exactly):
${resumeRef}

CAREER FACTS INVENTORY (verified facts you may draw from — these are real and can be introduced into bullets):
${CAREER_FACTS}

Your task — generate find/replace pairs that:
1. REWRITE the profile paragraph entirely to speak directly to this specific role and address the top uncovered requirements.
2. UPDATE at least 4 bullets — for each, either reframe the existing text using JD language OR replace it with a stronger version that introduces a specific, relevant fact from the Career Facts Inventory above. Pick the highest-leverage changes.
3. SWAP up to 2 Areas of Expertise items if the JD uses different but equivalent terminology.

Rules:
- "find" must be an exact substring of the resume content above — character-for-character match
- You may introduce new facts into replacements, but ONLY from the Career Facts Inventory — never fabricate
- When introducing a career fact not currently on the resume, replace a weaker bullet with the stronger fact-enriched version
- Prefer specific metrics and named outcomes over generic framing
- Return an empty array only if no meaningful improvement is possible

Return only valid JSON — an array of objects:
[
  { "find": "exact text from resume", "replace": "replacement text" }
]`;

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
  const changes = JSON.parse(raw);
  return Array.isArray(changes) ? changes : [];
}

/**
 * Builds a flat text representation of a resume version with changes applied.
 * Used for ATS keyword scoring without hitting Google Drive.
 */
function buildResumeText(baseResume, tailoredChanges = []) {
  const fallback = Object.keys(RESUME_CONTENT)[0] || 'default';
  const content = RESUME_CONTENT[baseResume] || RESUME_CONTENT[fallback];
  let text = [
    content.profile,
    content.expertise.join(' | '),
    content.bullets.join('\n'),
  ].join('\n\n');

  for (const change of tailoredChanges) {
    if (change.find && change.replace !== undefined) {
      text = text.split(change.find).join(change.replace);
    }
  }
  return text;
}

/**
 * Fetches the JD, runs two-stage analysis + tailoring.
 * Falls back to the first configured base resume with no changes on error.
 *
 * @param {string|null} url - Job posting URL (may be null for email-sourced jobs)
 * @param {string} title - Job title
 * @param {string} company - Company name
 * @returns {{ baseResume: string, reasoning: string, tailoredChanges: Array<{find: string, replace: string}>, jdText: string }}
 */
async function tailorResume(url, title, company) {
  let jdText = '';

  if (url) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobSearchBot/1.0)' },
      });
      if (res.ok) {
        const html = await res.text();
        jdText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
      }
    } catch (err) {
      console.warn(`Could not fetch JD from ${url}: ${err.message}`);
    }
  }

  const fallbackBase = Object.keys(RESUME_CONTENT)[0] || 'default';

  try {
    const analysis = await analyzeGaps(jdText, title, company);
    const rawChanges = await generateEdits(analysis, jdText, title, company);
    const tailoredChanges = rawChanges.map(c => ({ find: c.find, replace: sanitizeDashes(c.replace) }));

    return {
      baseResume: analysis.baseResume,
      reasoning: analysis.reasoning,
      tailoredChanges,
      jdText,
    };
  } catch (err) {
    console.error(`Resume tailoring failed: ${err.message}`);
    return { baseResume: fallbackBase, reasoning: '', tailoredChanges: [], jdText: '' };
  }
}

module.exports = { tailorResume, buildResumeText };
