/**
 * Creates the Job Search Tracker Google Sheet and prints the ID.
 * Run once, then add the ID as GOOGLE_SHEET_ID in Vercel env vars.
 *
 * Usage: node scripts/init-sheet.js
 */

const { initSheet } = require('../lib/sheets');

initSheet().catch(err => {
  console.error('Failed to create sheet:', err.message);
  process.exit(1);
});
