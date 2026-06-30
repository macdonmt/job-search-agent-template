/**
 * auth.js
 *
 * Run once to authorize the app with your Google account.
 * Opens a browser window, prompts you to sign in, then saves
 * a token to credentials/token.json for future use.
 *
 * Usage:
 *   node scripts/auth.js credentials/oauth-client.json
 */

const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
];

const TOKEN_PATH = path.join(__dirname, '../credentials/token.json');

async function main() {
  if (!process.argv[2]) {
    console.error('Usage: node scripts/auth.js credentials/oauth-client.json');
    process.exit(1);
  }
  const keyfilePath = path.resolve(process.argv[2]);

  if (!fs.existsSync(keyfilePath)) {
    console.error(`File not found: ${keyfilePath}`);
    console.error('Download your OAuth client JSON from Google Cloud Console and save it to credentials/oauth-client.json');
    process.exit(1);
  }

  console.log('Opening browser for Google authorization...');
  const client = await authenticate({ scopes: SCOPES, keyfilePath });

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(client.credentials, null, 2));
  console.log(`Token saved to ${TOKEN_PATH}`);
  console.log('You can now run transform-resume.js.');
}

main().catch(err => {
  console.error('Auth failed:', err.message);
  process.exit(1);
});
