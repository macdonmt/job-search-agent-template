/**
 * /api/webhook/slack
 * Handles Slack interactive component callbacks.
 *
 * Supported interactions:
 *   block_actions / generate_resume  — generate tailored resume from a /add job (has URL)
 *   block_actions / add_link         — open modal to collect company URL for an email-sourced job
 *   view_submission / add_link_modal — process submitted URL, enrich sheet row, generate resume
 */

const crypto = require('crypto');
const { waitUntil } = require('@vercel/functions');
const { generateResume } = require('../../lib/resume');
const { tailorResume, buildResumeText } = require('../../lib/tailor');
const { scoreKeywords } = require('../../lib/ats');
const { writeResumeRecord, updateJobLink } = require('../../lib/sheets');

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

function buildResumeBlocks(title, company, driveUrl, baseResume, reasoning, tailoredChanges, atsScore) {
  const truncate = (s, n) => s.length > n ? s.slice(0, n) + '…' : s;
  const changeLines = tailoredChanges.length > 0
    ? tailoredChanges.map(c =>
        `• _"${truncate(c.find, 60)}"_ → _"${truncate(c.replace, 60)}"_`
      ).join('\n')
    : '• No changes — base version was a good fit';

  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Resume ready:* ${title} @ ${company}\n<${driveUrl}|Tailored Resume>` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Base:* \`${baseResume}\`${reasoning ? ` — ${reasoning}` : ''}` },
    },
  ];

  if (atsScore) {
    const delta = atsScore.tailoredScore - atsScore.baseScore;
    const deltaStr = delta > 0 ? ` (+${delta} from base)` : delta < 0 ? ` (${delta} from base)` : ' (no change from base)';
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*ATS match:* ${atsScore.tailoredScore}/${atsScore.total} keywords${deltaStr}` },
    });
  }

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*AI changes (${tailoredChanges.length}):*\n${changeLines}` },
  });

  return blocks;
}

async function runResumeGeneration({ jobId, title, company, url, responseUrl }) {
  const { baseResume, reasoning, tailoredChanges, jdText } = await tailorResume(url, title, company);
  const [driveUrl, atsScore] = await Promise.all([
    generateResume({ baseResume, title, company, tailoredChanges }),
    scoreKeywords(jdText, buildResumeText(baseResume, []), buildResumeText(baseResume, tailoredChanges)).catch(() => null),
  ]);
  await writeResumeRecord(jobId, { driveUrl, baseResume, reasoning, tailoredChanges }).catch(err =>
    console.error('writeResumeRecord failed:', err.message)
  );
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response_type: 'ephemeral',
      blocks: buildResumeBlocks(title, company, driveUrl, baseResume, reasoning, tailoredChanges, atsScore),
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);

  if (!validateSignature(rawBody, req.headers['x-slack-request-timestamp'], req.headers['x-slack-signature'])) {
    return res.status(403).end();
  }

  const params = Object.fromEntries(new URLSearchParams(rawBody));
  const payload = JSON.parse(params.payload);

  // ── Block actions (button clicks) ──────────────────────────────────────────
  if (payload.type === 'block_actions') {
    const action = payload.actions[0];

    // "Generate Resume" — /add jobs that already have a URL
    if (action.action_id === 'generate_resume') {
      const { jobId, title, company, url } = JSON.parse(action.value);
      const responseUrl = payload.response_url;
      res.status(200).end();
      waitUntil(
        runResumeGeneration({ jobId, title, company, url, responseUrl }).catch(err => {
          console.error('Generate resume error:', err);
          fetch(responseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response_type: 'ephemeral', text: `Failed to generate resume: ${err.message}` }),
          }).catch(() => {});
        })
      );
      return;
    }

    // "Add Link" — email-sourced jobs; open modal to collect company URL
    if (action.action_id === 'add_link') {
      const { jobId, title, company } = JSON.parse(action.value);
      const responseUrl = payload.response_url;
      const triggerId = payload.trigger_id;

      await fetch('https://slack.com/api/views.open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        },
        body: JSON.stringify({
          trigger_id: triggerId,
          view: {
            type: 'modal',
            callback_id: 'add_link_modal',
            private_metadata: JSON.stringify({ jobId, title, company, responseUrl }),
            title: { type: 'plain_text', text: 'Add Job Link' },
            submit: { type: 'plain_text', text: 'Generate Resume' },
            close: { type: 'plain_text', text: 'Cancel' },
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `*${title}* @ ${company}` },
              },
              {
                type: 'input',
                block_id: 'job_url',
                label: { type: 'plain_text', text: 'Company job posting URL' },
                hint: { type: 'plain_text', text: 'Paste the direct URL from the company careers page — not the LinkedIn link.' },
                element: {
                  type: 'plain_text_input',
                  action_id: 'url_input',
                  placeholder: { type: 'plain_text', text: 'https://...' },
                },
              },
            ],
          },
        }),
      });

      return res.status(200).end();
    }
  }

  // ── Modal submission ────────────────────────────────────────────────────────
  if (payload.type === 'view_submission' && payload.view.callback_id === 'add_link_modal') {
    const { jobId, title, company, responseUrl } = JSON.parse(payload.view.private_metadata);
    const url = payload.view.state.values.job_url.url_input.value?.trim();

    if (!url || !url.startsWith('http')) {
      return res.status(200).json({
        response_action: 'errors',
        errors: { job_url: 'Please enter a valid URL starting with https://' },
      });
    }

    // ACK immediately — Slack requires < 3s response for view_submission
    res.status(200).json({ response_action: 'clear' });

    waitUntil(
      (async () => {
        try {
          await updateJobLink(jobId, url);
          await runResumeGeneration({ jobId, title, company, url, responseUrl });
        } catch (err) {
          console.error('Add link resume error:', err);
          await fetch(responseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response_type: 'ephemeral', text: `Failed to generate resume: ${err.message}` }),
          }).catch(() => {});
        }
      })()
    );
    return;
  }

  res.status(200).end();
}
