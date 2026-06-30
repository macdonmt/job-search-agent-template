const { google } = require('googleapis');
const { getAuthClient } = require('./google-auth');

// Configure these in your Vercel environment variables
const TAILORED_FOLDER_ID = process.env.GOOGLE_DRIVE_TAILORED_FOLDER_ID;
const RESUME_FULL_NAME = process.env.RESUME_FULL_NAME || 'Your Name';

// Map resume type slugs to base Google Doc IDs
// Add your own resume Doc IDs here — get the ID from the URL of your Google Doc:
// https://docs.google.com/document/d/THIS_IS_THE_ID/edit
const BASE_RESUME_IDS = {
  'default': process.env.GOOGLE_DRIVE_BASE_RESUME_ID,
};

// Optional: static text replacements to apply on top of AI edits, per resume type.
// Useful for swapping out a job title or profile summary across all tailored copies.
// See changes/tpm.json for the expected format.
const CHANGES = {
  'default': [],
};

/**
 * Copies the base resume to the Tailored Resumes folder, applies any changes, and returns the Drive URL.
 *
 * @param {{ baseResume?: string, title: string, company: string, tailoredChanges?: Array }} options
 */
async function generateResume({ baseResume = 'default', title, company, tailoredChanges = [] }) {
  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const docs = google.docs({ version: 'v1', auth });

  const date = new Date().toISOString().split('T')[0];
  const companySlug = company || 'Unknown';
  const titleSlug = title || 'Resume';
  const outputTitle = `${RESUME_FULL_NAME} - ${companySlug} - ${titleSlug} - ${date}`;

  const sourceId = BASE_RESUME_IDS[baseResume] || BASE_RESUME_IDS['default'];

  if (!sourceId) {
    throw new Error(`No base resume ID found for type "${baseResume}". Set GOOGLE_DRIVE_BASE_RESUME_ID in your environment variables.`);
  }
  if (!TAILORED_FOLDER_ID) {
    throw new Error('GOOGLE_DRIVE_TAILORED_FOLDER_ID is not set. Add it to your Vercel environment variables.');
  }

  const copy = await drive.files.copy({
    fileId: sourceId,
    requestBody: {
      name: outputTitle,
      parents: [TAILORED_FOLDER_ID],
      mimeType: 'application/vnd.google-apps.document',
    },
  });
  const docId = copy.data.id;

  const allChanges = [...(CHANGES[baseResume] || []), ...tailoredChanges];
  if (allChanges.length > 0) {
    const requests = allChanges
      .filter(r => r.find && r.replace !== undefined)
      .map(r => ({
        replaceAllText: {
          containsText: { text: r.find, matchCase: true },
          replaceText: r.replace,
        },
      }));

    if (requests.length > 0) {
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests },
      });
    }
  }

  return `https://docs.google.com/document/d/${docId}/edit`;
}

module.exports = { generateResume };
