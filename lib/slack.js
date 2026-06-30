const { IncomingWebhook } = require('@slack/webhook');
const crypto = require('crypto');

const webhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);

/**
 * Posts a job alert to Slack with a Generate Resume button per job.
 *
 * @param {Array} jobs - Array of scored job objects
 */
async function postJobAlert(jobs) {
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Job Alert — ${jobs.length} new role${jobs.length > 1 ? 's' : ''}` },
    },
    { type: 'divider' },
  ];

  jobs.forEach((job, i) => {
    const linkLine = job.url ? ` · <${job.url}|View Job>` : '';
    const contactLine = job.contactCount > 0
      ? `\n👥 ${job.contactCount} connection${job.contactCount > 1 ? 's' : ''}`
      : '';
    const referralLine = job.confirmedReferral ? `\n🎯 ${job.referralNote}` : '';
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${i + 1}. ${job.title}* @ ${job.company}\n${job.location} · Score: ${job.score}${linkLine}${contactLine}${referralLine}`,
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Add Link' },
        value: JSON.stringify({ jobId: job.id, title: job.title, company: job.company }),
        action_id: 'add_link',
      },
    });
    blocks.push({ type: 'divider' });
  });

  return webhook.send({ blocks });
}

/**
 * Posts a simple text message (e.g. resume ready confirmation).
 */
async function postMessage(text) {
  return webhook.send({ text });
}

/**
 * Posts the morning digest to Slack.
 */
async function postDigest({ pipeline, followUps, resumeQueue, newRoles, linkedin, cert, summary }) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Morning Digest — ${today}` },
    },
  ];

  // Sonnet summary
  if (summary) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: summary } });
  }

  blocks.push({ type: 'divider' });

  // Pipeline
  const PIPELINE_ORDER = ['Open', 'Watching', 'Applied', 'Phone Screen', 'Interview', 'Loop', 'Offer'];
  const pipelineLines = PIPELINE_ORDER
    .filter(s => pipeline[s] > 0)
    .map(s => `${s}: ${pipeline[s]}`);
  const closedTotal = Object.entries(pipeline)
    .filter(([s]) => ['Closed', 'Not a Fit', 'Not Recommended', 'Rejected'].some(c => s.includes(c)))
    .reduce((sum, [, n]) => sum + n, 0);
  if (closedTotal > 0) pipelineLines.push(`Closed/Out: ${closedTotal}`);

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Pipeline*\n${pipelineLines.length > 0 ? pipelineLines.join('  ·  ') : 'No active roles yet'}`,
    },
  });

  // New roles — counts + Act Now links (cap at 5; strip URL tracking params)
  if (newRoles.total > 0) {
    const parts = [];
    if (newRoles.actNow > 0) parts.push(`*${newRoles.actNow} Act Now*`);
    if (newRoles.reviewSoon > 0) parts.push(`${newRoles.reviewSoon} Review Soon`);
    const onRadar = newRoles.total - newRoles.actNow - newRoles.reviewSoon;
    if (onRadar > 0) parts.push(`${onRadar} On Radar`);

    let text = `*New Roles (last 24 hrs)*\n${parts.join('  ·  ')}`;
    if (newRoles.actNowJobs?.length > 0) {
      const shown = newRoles.actNowJobs.slice(0, 5);
      const jobLines = shown.map(j => {
        const cleanUrl = j.url ? j.url.split('?')[0] : null;
        const link = cleanUrl ? ` · <${cleanUrl}|View>` : '';
        return `• ${j.title} @ ${j.company}${link}`;
      });
      if (newRoles.actNow > 5) jobLines.push(`_...and ${newRoles.actNow - 5} more_`);
      text += `\n${jobLines.join('\n')}`;
    }
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text } });
  }

  // Resume queue
  if (resumeQueue.length > 0) {
    const lines = resumeQueue.slice(0, 5).map(j => {
      const link = j.url ? ` · <${j.url}|View>` : '';
      return `• ${j.title} @ ${j.company}${link}`;
    });
    if (resumeQueue.length > 5) lines.push(`_...and ${resumeQueue.length - 5} more_`);
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Resume Queue — ${resumeQueue.length} ready to apply*\n${lines.join('\n')}` },
    });
  }

  // Follow-ups due
  if (followUps.length > 0) {
    const lines = followUps.map(j => {
      const applied = new Date(j.dateApplied).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const link = j.url ? ` · <${j.url}|View>` : '';
      return `• ${j.title} @ ${j.company} (applied ${applied})${link}`;
    });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Follow-ups Due — ${followUps.length} need${followUps.length === 1 ? 's' : ''} a nudge*\n${lines.join('\n')}` },
    });
  }

  // LinkedIn post reminder
  if (linkedin?.due) {
    const topicLine = linkedin.topic ? `\nSuggested topic: _${linkedin.topic}_` : '';
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*LinkedIn* — post due today${topicLine}` },
    });
  }

  // Cert study prompt
  if (cert) {
    const topicLine = cert.topic ? `: ${cert.topic}` : '';
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${cert.cert} Study* — ${cert.topic || 'review your notes'}` },
    });
  }

  return webhook.send({ blocks });
}

/**
 * Validates an incoming Slack interaction request using the signing secret.
 */
function validateSlackRequest(req) {
  const timestamp = req.headers['x-slack-request-timestamp'];
  const slackSig = req.headers['x-slack-signature'];

  // Reject requests older than 5 minutes
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

  const sigBase = `v0:${timestamp}:${req.rawBody}`;
  const hmac = crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
    .update(sigBase)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(`v0=${hmac}`),
    Buffer.from(slackSig)
  );
}

module.exports = { postJobAlert, postMessage, postDigest, validateSlackRequest };
