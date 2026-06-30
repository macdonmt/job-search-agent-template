const { google } = require('googleapis');
const { getAuthClient } = require('../lib/google-auth');

async function main() {
  const auth = getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  // List all labels
  const labelsRes = await gmail.users.labels.list({ userId: 'me' });
  console.log('\nAll Gmail labels:');
  labelsRes.data.labels.forEach(l => console.log(`  "${l.name}" (${l.id})`));

  // Try to find Job Alerts
  const match = labelsRes.data.labels.find(l => l.name.toLowerCase() === 'job alerts');
  if (!match) {
    console.log('\n[!] No label matching "Job Alerts" found.');
    return;
  }

  console.log(`\nFound label: "${match.name}" (${match.id})`);

  // List messages in that label
  const msgs = await gmail.users.messages.list({
    userId: 'me',
    labelIds: [match.id],
    maxResults: 10,
  });

  const count = msgs.data.messages?.length ?? 0;
  console.log(`Messages in label: ${count}`);

  if (count > 0) {
    // Show subject of first message
    const first = await gmail.users.messages.get({
      userId: 'me',
      id: msgs.data.messages[0].id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From'],
    });
    const subject = first.data.payload.headers.find(h => h.name === 'Subject')?.value;
    const from = first.data.payload.headers.find(h => h.name === 'From')?.value;
    console.log(`\nFirst email — Subject: "${subject}"`);
    console.log(`              From:    "${from}"`);
  }
}

main().catch(err => console.error('Error:', err.message));
