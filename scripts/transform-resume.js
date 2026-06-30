/**
 * transform-resume.js
 *
 * Copies a base resume from Google Drive, converts it to a Google Doc,
 * and applies a set of text replacements defined in a changes JSON file.
 *
 * Usage:
 *   node scripts/transform-resume.js <changes-file.json>
 *
 * Example:
 *   node scripts/transform-resume.js changes/tpm.json
 *
 * Requires credentials/token.json — run "node scripts/auth.js" once first.
 */

const { google } = require('googleapis');
const fs = require('fs');
const { getAuthClient } = require('../lib/google-auth');

async function transformResume(changesFile) {
  const changes = JSON.parse(fs.readFileSync(changesFile, 'utf8'));
  const { sourceFileId, targetFolderId, outputTitle, replacements } = changes;

  const authClient = getAuthClient();
  const drive = google.drive({ version: 'v3', auth: authClient });
  const docs = google.docs({ version: 'v1', auth: authClient });

  // Step 1: Copy the source file, converting to Google Doc in the process
  console.log(`Copying "${sourceFileId}" → "${outputTitle}"...`);
  const copyResponse = await drive.files.copy({
    fileId: sourceFileId,
    requestBody: {
      name: outputTitle,
      parents: [targetFolderId],
      mimeType: 'application/vnd.google-apps.document',
    },
  });

  const docId = copyResponse.data.id;
  console.log(`Created doc: https://docs.google.com/document/d/${docId}/edit`);

  // Step 2: Apply text replacements via Docs batchUpdate
  // Replacements are applied in order — put more specific/longer strings first
  // to avoid partial-match collisions.
  const requests = replacements
    .filter(r => r.find && r.replace !== undefined)
    .map(r => ({
      replaceAllText: {
        containsText: {
          text: r.find,
          matchCase: true,
        },
        replaceText: r.replace,
      },
    }));

  if (requests.length > 0) {
    console.log(`Applying ${requests.length} replacements...`);
    const result = await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests },
    });

    // Report how many replacements actually matched
    const replies = result.data.replies || [];
    replies.forEach((reply, i) => {
      const count = reply.replaceAllText?.occurrencesChanged ?? 0;
      if (count === 0) {
        console.warn(`  [!] No match found for: "${replacements[i].find.substring(0, 60)}..."`);
      } else {
        console.log(`  [✓] ${count} replacement(s): "${replacements[i].find.substring(0, 60)}..."`);
      }
    });
  }

  const url = `https://docs.google.com/document/d/${docId}/edit`;
  console.log(`\nDone: ${url}`);
  return { docId, url };
}

// Entry point
const [changesFile] = process.argv.slice(2);

if (!changesFile) {
  console.error('Usage: node scripts/transform-resume.js <changes-file.json>');
  process.exit(1);
}

transformResume(changesFile).catch(err => {
  console.error('Error:', err.message);
  if (err.errors) console.error(JSON.stringify(err.errors, null, 2));
  process.exit(1);
});
