/**
 * Google API auth client.
 *
 * Local: reads credentials from credentials/oauth-client.json + credentials/token.json
 * Vercel: reads from GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN env vars
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

function getAuthClient() {
  // Vercel / production: use environment variables
  if (process.env.GOOGLE_CLIENT_ID) {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return client;
  }

  // Local: use credential files
  const tokenPath = path.join(__dirname, '../credentials/token.json');
  const oauthPath = path.join(__dirname, '../credentials/oauth-client.json');

  if (!fs.existsSync(tokenPath)) {
    throw new Error('No token found. Run "node scripts/auth.js credentials/oauth-client.json" first.');
  }

  const { refresh_token } = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  const { client_id, client_secret } = JSON.parse(fs.readFileSync(oauthPath, 'utf8')).installed;

  const client = new google.auth.OAuth2(client_id, client_secret);
  client.setCredentials({ refresh_token });
  return client;
}

module.exports = { getAuthClient };
