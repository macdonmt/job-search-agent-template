/**
 * /api/slack/add
 * Handles the /add <url> Slack slash command.
 *
 * Fetches the job page, extracts details with Claude, scores it,
 * dedupes against the sheet, and appends if new.
 */

const crypto = require('crypto');
const { waitUntil } = require('@vercel/functions');
const { parseUrlJob, assignTiers, dedupeJobs } = require('../../lib/jobs');
const { scoreJobs } = require('../../lib/scoring');
const { getExistingJobIds, appendJobs } = require('../../lib/sheets');

// Raw body needed for Slack signature validation
export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function validateSignature(rawBody, timestamp, slackSig) {
  if (!timestamp || !slackSig) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const hmac = crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(`v0=${hmac}`), Buffer.from(slackSig));
}

async function replyToSlack(responseUrl, text) {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response_type: 'ephemeral', text }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  if (!validateSignature(rawBody, req.headers['x-slack-request-timestamp'], req.headers['x-slack-signature'])) {
    return res.status(403).end();
  }

  const params = Object.fromEntries(new URLSearchParams(rawBody));
  const responseUrl = params.response_url;

  // Strip quotes and angle brackets Slack sometimes wraps URLs in
  const url = (params.text || '').trim().replace(/^[<"']|[>"']$/g, '');

  if (!url || !url.startsWith('http')) {
    return res.status(200).json({
      response_type: 'ephemeral',
      text: 'Usage: `/add <job-url>`',
    });
  }

  // ACK within 3 seconds — Slack requires it
  res.status(200).json({
    response_type: 'ephemeral',
    text: `Fetching job from ${url}...`,
  });

  // waitUntil keeps the function alive after the response is sent
  waitUntil(
    (async () => {
      try {
        const rawJob = await parseUrlJob(url);
        const [tiered] = assignTiers([rawJob]);
        const existingIds = await getExistingJobIds();

        if (existingIds.includes(tiered.id)) {
          await replyToSlack(responseUrl, `Already in tracker: *${tiered.title}* @ ${tiered.company}`);
          return;
        }

        const [scored] = scoreJobs([tiered]);
        await appendJobs([scored]);

        await fetch(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            response_type: 'ephemeral',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `Added to tracker: *${scored.title}* @ ${scored.company} — ${scored.priority} (score: ${scored.score})${scored.contactCount > 0 ? ` · 👥 ${scored.contactCount} connection${scored.contactCount > 1 ? 's' : ''}` : ''}`,
                },
                accessory: {
                  type: 'button',
                  text: { type: 'plain_text', text: 'Generate Resume' },
                  value: JSON.stringify({ jobId: scored.id, title: scored.title, company: scored.company, url: scored.url, source: 'manual' }),
                  action_id: 'generate_resume',
                },
              },
            ],
          }),
        });
      } catch (err) {
        console.error('Add job error:', err);
        await replyToSlack(responseUrl, `Failed to add job: ${err.message}`).catch(() => {});
      }
    })()
  );
}
