const { google } = require('googleapis');
const { getAuthClient } = require('./google-auth');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB = 'Jobs';

// Column order must match HEADERS exactly
const HEADERS = [
  'Job ID', 'Title', 'Company', 'Tier', 'Link', 'Source',
  'Date Found', 'Date Closed', 'Status', 'Feedback', 'Priority', 'Score',
  'Contact', 'Applied', 'Date Applied', 'Resume', 'Notes', 'Salary', 'Office', 'Referral',
];

function jobToRow(job) {
  return [
    job.id,
    job.title,
    job.company,
    job.tier ?? '',
    job.url ?? '',
    job.emailSource ? `${job.source} (${job.emailSource})` : job.source,
    job.dateFound,
    '',                        // Date Closed
    job.status ?? 'Open',      // Status
    '',                        // Feedback
    job.priority,
    job.score,
    job.contactCount > 0
      ? `${job.contactCount} connection${job.contactCount > 1 ? 's' : ''}: ${job.contact}`
      : '',
    'N',          // Applied
    '',           // Date Applied
    '',           // Resume
    '',           // Notes
    job.salary ?? '',
    job.officeType ?? '',
    job.referralNote ?? '',
  ];
}

async function getSheets() {
  const auth = getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

async function getExistingJobIds() {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A2:A`,
  });
  return (res.data.values || []).flat();
}

async function appendJobs(jobs) {
  if (jobs.length === 0) return;
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: jobs.map(jobToRow) },
  });
  console.log(`Appended ${jobs.length} job(s) to sheet.`);
}

async function initSheet() {
  const sheets = await getSheets();

  // Create spreadsheet
  const ss = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: 'Job Search Tracker' },
      sheets: [
        { properties: { title: TAB } },
        { properties: { title: 'Processed Emails' } },
      ],
    },
  });

  const id = ss.data.spreadsheetId;
  const jobsSheetId = ss.data.sheets[0].properties.sheetId;

  // Write headers
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  });

  // Bold the header row
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      requests: [{
        repeatCell: {
          range: { sheetId: jobsSheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: 'userEnteredFormat.textFormat.bold',
        },
      }],
    },
  });

  console.log(`Created tracker sheet: https://docs.google.com/spreadsheets/d/${id}/edit`);
  console.log(`Add GOOGLE_SHEET_ID=${id} to your Vercel env vars.`);
  return id;
}

async function getProcessedEmailIds() {
  const sheets = await getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `Processed Emails!A2:A`,
    });
    return new Set((res.data.values || []).flat());
  } catch {
    return new Set();
  }
}

async function markEmailsProcessed(emailIds) {
  if (emailIds.length === 0) return;
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `Processed Emails!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: emailIds.map(id => [id]) },
  });
}

const SCORING_CONTEXT_TAB = 'Scoring Context';

async function getScoringContext() {
  const sheets = await getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SCORING_CONTEXT_TAB}!A1`,
    });
    const raw = res.data.values?.[0]?.[0];
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveScoringContext(context) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SCORING_CONTEXT_TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [[JSON.stringify(context)]] },
  });
}

async function getNotAFitFeedback() {
  const sheets = await getSheets();
  const statusIdx = HEADERS.indexOf('Status');    // col I
  const feedbackIdx = HEADERS.indexOf('Feedback'); // col J
  const titleIdx = HEADERS.indexOf('Title');
  const companyIdx = HEADERS.indexOf('Company');
  const lastCol = String.fromCharCode(65 + HEADERS.length - 1);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A2:${lastCol}`,
  });
  const rows = res.data.values || [];
  return rows
    .filter(r => r[statusIdx]?.toLowerCase().includes('not a fit') && r[feedbackIdx])
    .map(r => ({ title: r[titleIdx], company: r[companyIdx], feedback: r[feedbackIdx] }));
}

async function writeResumeRecord(jobId, { driveUrl, baseResume, reasoning, tailoredChanges }) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A2:A`,
  });
  const ids = (res.data.values || []).flat();
  const rowIndex = ids.indexOf(jobId);
  if (rowIndex === -1) {
    console.warn(`writeResumeRecord: jobId "${jobId}" not found in sheet`);
    return;
  }
  const sheetRow = rowIndex + 2;
  const resumeCol = String.fromCharCode(65 + HEADERS.indexOf('Resume'));   // O
  const notesCol  = String.fromCharCode(65 + HEADERS.indexOf('Notes'));    // P

  const changeLines = tailoredChanges.length > 0
    ? tailoredChanges.map(c => `• "${c.find}" → "${c.replace}"`).join('\n')
    : '• No changes — base version was a good fit';
  const changesSummary = `Base: ${baseResume}${reasoning ? `\nReason: ${reasoning}` : ''}\n${changeLines}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!${resumeCol}${sheetRow}:${notesCol}${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[driveUrl, changesSummary]] },
  });
}

async function updateJobLink(jobId, url) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A2:A`,
  });
  const ids = (res.data.values || []).flat();
  const rowIndex = ids.indexOf(jobId);
  if (rowIndex === -1) return false;
  const sheetRow = rowIndex + 2;
  const linkCol = String.fromCharCode(65 + HEADERS.indexOf('Link'));
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!${linkCol}${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[url]] },
  });
  return true;
}

const CLOSED_STATUSES = ['Closed', 'Not a Fit', 'Not Recommended', 'Rejected'];

async function getDigestData() {
  const sheets = await getSheets();
  const lastCol = String.fromCharCode(65 + HEADERS.length - 1);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A2:${lastCol}`,
  });
  const rows = res.data.values || [];
  const idx = Object.fromEntries(HEADERS.map((h, i) => [h, i]));

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Pipeline health — count by Status
  const pipeline = {};
  for (const row of rows) {
    const status = row[idx['Status']] || 'Unknown';
    pipeline[status] = (pipeline[status] || 0) + 1;
  }

  // Follow-ups due — Applied status, Date Applied 7–10 days ago
  const followUps = rows
    .filter(row => {
      const status = row[idx['Status']] || '';
      const dateApplied = row[idx['Date Applied']];
      if (status !== 'Applied' || !dateApplied) return false;
      const days = Math.floor((now - new Date(dateApplied)) / 86400000);
      return days >= 7 && days <= 10;
    })
    .map(row => ({
      title: row[idx['Title']],
      company: row[idx['Company']],
      url: row[idx['Link']] || null,
      dateApplied: row[idx['Date Applied']],
    }));

  // Resume queue — tailored resume ready but not yet applied
  const resumeQueue = rows
    .filter(row => {
      const applied = row[idx['Applied']];
      const resume = row[idx['Resume']];
      const status = row[idx['Status']] || '';
      return applied !== 'Y' && resume && !CLOSED_STATUSES.some(s => status.includes(s));
    })
    .map(row => ({
      title: row[idx['Title']],
      company: row[idx['Company']],
      url: row[idx['Link']] || null,
    }));

  // New roles since yesterday's discover run
  const newRows = rows.filter(row => (row[idx['Date Found']] || '') >= yesterdayStr);
  const actNowJobs = newRows
    .filter(r => r[idx['Priority']] === 'Act Now')
    .map(r => ({ title: r[idx['Title']], company: r[idx['Company']], url: r[idx['Link']] || null }));
  const newRoles = {
    total: newRows.length,
    actNow: actNowJobs.length,
    actNowJobs,
    reviewSoon: newRows.filter(r => r[idx['Priority']] === 'Review Soon').length,
  };

  return { pipeline, followUps, resumeQueue, newRoles };
}

module.exports = { getExistingJobIds, appendJobs, initSheet, getProcessedEmailIds, markEmailsProcessed, writeResumeRecord, getScoringContext, saveScoringContext, getNotAFitFeedback, updateJobLink, getDigestData };
