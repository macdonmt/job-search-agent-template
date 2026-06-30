const Anthropic = require('@anthropic-ai/sdk');
const crypto = require('crypto');

function extractJson(text) {
  const s = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  const firstObj = s.indexOf('{');
  const firstArr = s.indexOf('[');
  if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
    return s.slice(firstArr, s.lastIndexOf(']') + 1);
  }
  return s.slice(firstObj, s.lastIndexOf('}') + 1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Uses Claude Haiku to extract job listings from an email body.
 * Handles any email format — LinkedIn alerts, Salesforce job digests, etc.
 */
async function parseEmailJobs(email) {
  const prompt = `Extract all job listings from this email. Return a JSON array of objects with these fields:
- title: job title (string)
- company: company name (string)
- location: location, e.g. "Chicago, IL" or "Remote" (string)
- url: direct application or job listing URL (string, or null if not found)
- emailSource: the service or company that sent this alert, e.g. "LinkedIn", "Salesforce Careers" (string)
- salary: salary range if mentioned, e.g. "$150,000 - $180,000" or "$150K-$180K" (string, or null if not found)
- officeType: work arrangement if mentioned — "Remote", "Hybrid", or "On-site" (string, or null if not clear)

Email subject: ${email.subject}
From: ${email.from}

Email body:
${email.body.slice(0, 8000)}

Return only a valid JSON array. If no jobs are found, return [].`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    const jobs = JSON.parse(extractJson(message.content[0].text));
    const today = new Date().toISOString().split('T')[0];
    return jobs.map((j, i) => ({
      id: `email_${email.id}_${i}`,
      title: j.title,
      company: j.company,
      tier: null, // scored later if company matches target list
      location: j.location || 'Unknown',
      url: j.url || null,
      source: 'email',
      emailSource: j.emailSource,
      salary: j.salary || null,
      officeType: j.officeType || null,
      dateFound: today,
    }));
  } catch (err) {
    console.error(`Failed to parse jobs from email "${email.subject}": ${err.message}`);
    return [];
  }
}

async function parseAllEmailJobs(emails) {
  const results = await Promise.all(emails.map(parseEmailJobs));
  return results.flat();
}

/**
 * Assigns tier and contact to jobs by matching company name against config and LinkedIn connections.
 */
function assignTiers(jobs) {
  const { companies: allCompanies } = require('../config/companies.json');
  const { findContactsAtCompany } = require('./contacts');
  const { getReferral } = require('./referrals');

  return jobs.map(job => {
    const tierMatch = job.tier === null
      ? allCompanies.find(c => job.company?.toLowerCase().includes(c.name.toLowerCase()))
      : null;
    const tier = job.tier !== null ? job.tier : (tierMatch?.tier ?? 3);

    const matches = findContactsAtCompany(job.company);
    const contactCount = matches.length;
    const contact = contactCount > 0
      ? matches.map(c => `${c.name} (${c.position})`).join(', ')
      : null;

    const referral = getReferral(job.company);

    return {
      ...job,
      tier,
      contact,
      contactCount,
      confirmedReferral: !!referral,
      referralNote: referral?.note ?? null,
    };
  });
}

/**
 * Removes jobs whose IDs already exist in the tracker sheet.
 */
function dedupeJobs(newJobs, existingIds) {
  const idSet = new Set(existingIds);
  return newJobs.filter(j => !idSet.has(j.id));
}

/**
 * Fetches a job posting URL and uses Claude Haiku to extract structured job details.
 */
async function parseUrlJob(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobSearchBot/1.0)' },
  });
  if (!res.ok) throw new Error(`Failed to fetch job page (${res.status}): ${url}`);
  const html = await res.text();
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000);

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Extract the job details from this page. Return a JSON object with:
- title: job title (string)
- company: company name (string)
- location: location, e.g. "Chicago, IL" or "Remote" (string)
- salary: salary range if listed, e.g. "$150,000 - $180,000" or "$150K-$180K" (string, or null if not found)
- officeType: work arrangement — "Remote", "Hybrid", or "On-site" (string, or null if not clear)

Page URL: ${url}
Page content: ${text}

Return only valid JSON.`,
    }],
  });

  const raw = message.content[0].text.trim();
  const parsed = JSON.parse(extractJson(raw));
  const urlHash = crypto.createHash('md5').update(url).digest('hex').slice(0, 8);

  return {
    id: `manual_${urlHash}`,
    title: parsed.title,
    company: parsed.company,
    tier: null,
    location: parsed.location || 'Unknown',
    url,
    source: 'manual',
    salary: parsed.salary || null,
    officeType: parsed.officeType || null,
    dateFound: new Date().toISOString().split('T')[0],
  };
}

module.exports = { parseAllEmailJobs, assignTiers, dedupeJobs, parseUrlJob };
