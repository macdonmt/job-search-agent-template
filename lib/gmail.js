const { google } = require('googleapis');
const { getAuthClient } = require('./google-auth');

const LABEL_NAME = 'Job Alerts';

async function getLabelId(gmail) {
  const res = await gmail.users.labels.list({ userId: 'me' });
  const label = res.data.labels.find(l => l.name === LABEL_NAME);
  if (!label) throw new Error(`Gmail label "${LABEL_NAME}" not found. Create it and apply it to job alert emails.`);
  return label.id;
}

function decodeBody(payload) {
  // Walk the MIME parts to find plain text or HTML
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = decodeBody(part);
      if (text) return text;
    }
  }
  return '';
}

async function fetchUnreadJobAlerts() {
  const auth = getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const labelId = await getLabelId(gmail);

  // List all messages in the Job Alerts label (dedup handled via sheet)
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    labelIds: [labelId],
    maxResults: 50,
  });

  const messages = listRes.data.messages || [];
  if (messages.length === 0) return [];

  // Fetch full content for each message
  const emails = await Promise.all(
    messages.map(async ({ id }) => {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'full',
      });
      const subject = msg.data.payload.headers.find(h => h.name === 'Subject')?.value || '';
      const from = msg.data.payload.headers.find(h => h.name === 'From')?.value || '';
      const body = decodeBody(msg.data.payload);
      return { id, subject, from, body };
    })
  );

  return emails;
}

module.exports = { fetchUnreadJobAlerts };
