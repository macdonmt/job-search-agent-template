/**
 * Traces the full discovery pipeline locally so we can see where jobs drop off.
 */

const { fetchUnreadJobAlerts } = require('../lib/gmail');
const { fetchAllCompanyJobs } = require('../lib/greenhouse');
const { parseAllEmailJobs, assignTiers, dedupeJobs } = require('../lib/jobs');
const { getExistingJobIds, getProcessedEmailIds } = require('../lib/sheets');

async function main() {
  console.log('\n--- Greenhouse/Lever ---');
  const apiJobs = await fetchAllCompanyJobs();
  console.log(`Found: ${apiJobs.length}`);

  console.log('\n--- Gmail ---');
  const allEmails = await fetchUnreadJobAlerts();
  console.log(`Emails in label: ${allEmails.length}`);

  const processedIds = await getProcessedEmailIds();
  console.log(`Already processed: ${processedIds.size}`);

  const emails = allEmails.filter(e => !processedIds.has(e.id));
  console.log(`Emails to process: ${emails.length}`);

  if (emails.length > 0) {
    console.log('\n--- Claude Parsing ---');
    const emailJobs = await parseAllEmailJobs(emails);
    console.log(`Jobs parsed from emails: ${emailJobs.length}`);
    if (emailJobs.length > 0) {
      console.log('Sample:', JSON.stringify(emailJobs[0], null, 2));
    } else {
      console.log('Email body preview (first 500 chars):');
      console.log(emails[0].body.slice(0, 500));
    }
  }

  console.log('\n--- Dedup ---');
  const allNew = assignTiers([...apiJobs, ...(emails.length > 0 ? await parseAllEmailJobs(emails) : [])]);
  const existingIds = await getExistingJobIds();
  console.log(`Existing job IDs in sheet: ${existingIds.length}`);
  const newJobs = dedupeJobs(allNew, existingIds);
  console.log(`New jobs after dedup: ${newJobs.length}`);
}

main().catch(err => console.error('Error:', err.message));
