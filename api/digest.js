/**
 * /api/digest
 * Cron: daily at 8am CT (14:00 UTC), runs after /api/discover
 *
 * Posts a morning summary to Slack:
 * - Sonnet-generated 3-sentence briefing
 * - Pipeline health (counts by status)
 * - New roles found since yesterday (Act Now with links)
 * - Resume queue (tailored resumes not yet applied)
 * - Follow-ups due (applied 7-10 days ago, no status change)
 * - LinkedIn post reminder (optional, config/digest.json)
 * - Cert study prompt (optional, config/digest.json)
 */

const { getDigestData } = require('../lib/sheets');
const { postDigest } = require('../lib/slack');
const { loadDigestConfig, getLinkedInSection, getCertSection, generateSummary } = require('../lib/digest');

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const config = loadDigestConfig();
    const data = await getDigestData();
    const linkedin = getLinkedInSection(config);
    const cert = getCertSection(config);
    const summary = await generateSummary({ ...data, linkedin, cert });

    await postDigest({ ...data, linkedin, cert, summary });

    res.status(200).json({ ok: true, followUps: data.followUps.length, resumeQueue: data.resumeQueue.length, newRoles: data.newRoles.total });
  } catch (err) {
    console.error('Digest error:', err);
    res.status(500).json({ error: err.message });
  }
}
