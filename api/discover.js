/**
 * /api/discover
 * Cron: daily at 9am CT (13:00 UTC)
 *
 * 1. Fetch unread job alert emails from Gmail
 * 2. Parse emails with Claude, normalize jobs
 * 3. Dedupe against existing sheet entries
 * 4. Score and classify new jobs (applies learned scoring context)
 * 5. Write new jobs to Google Sheet
 * 6. Post Act Now jobs to Slack
 * 7. Mark processed emails as read
 */

const { fetchUnreadJobAlerts } = require('../lib/gmail');
const { parseAllEmailJobs, assignTiers, dedupeJobs } = require('../lib/jobs');
const { scoreJobs } = require('../lib/scoring');
const { getExistingJobIds, appendJobs, getProcessedEmailIds, markEmailsProcessed, getScoringContext } = require('../lib/sheets');
const { postJobAlert, postMessage } = require('../lib/slack');

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Starting job discovery...');

    // 1. Fetch job alert emails, skip already-processed ones
    const allEmails = await fetchUnreadJobAlerts();
    const processedIds = await getProcessedEmailIds();
    const emails = allEmails.filter(e => !processedIds.has(e.id));
    console.log(`Found ${emails.length} new job alert email(s) (${allEmails.length - emails.length} already processed).`);

    // 3. Parse emails with Claude
    const emailJobs = emails.length > 0 ? await parseAllEmailJobs(emails) : [];
    console.log(`Parsed ${emailJobs.length} jobs from emails.`);

    // 3b. Assign tiers, dedupe
    const allNew = assignTiers(emailJobs);
    const existingIds = await getExistingJobIds();
    const newJobs = dedupeJobs(allNew, existingIds);
    console.log(`${newJobs.length} new jobs after deduplication.`);

    if (newJobs.length === 0) {
      await postMessage('Job scan complete — no new roles found today.');
      await markEmailsProcessed(emails.map(e => e.id));
      return res.status(200).json({ found: 0 });
    }

    // 5. Score (with learned context if available)
    const scoringContext = await getScoringContext();
    const scoredJobs = scoreJobs(newJobs, scoringContext);

    // 6. Write to sheet
    await appendJobs(scoredJobs);

    // 7. Post Act Now jobs to Slack
    const actNow = scoredJobs.filter(j => j.priority === 'Act Now' && j.status !== 'Not Recommended');
    if (actNow.length > 0) {
      await postJobAlert(actNow);
    } else {
      await postMessage(`Job scan complete — ${scoredJobs.length} new role(s) added to tracker. No Act Now matches today.`);
    }

    // 8. Record processed email IDs so we don't re-parse them tomorrow
    if (emails.length > 0) {
      await markEmailsProcessed(emails.map(e => e.id));
    }

    res.status(200).json({ found: scoredJobs.length, actNow: actNow.length });
  } catch (err) {
    console.error('Discover error:', err);
    await postMessage(`Job scan failed: ${err.message}`).catch(() => {});
    res.status(500).json({ error: err.message });
  }
}
