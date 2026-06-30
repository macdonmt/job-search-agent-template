const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function loadDigestConfig() {
  try {
    return require('../config/digest.json');
  } catch {
    return { linkedin: { enabled: false }, certs: { enabled: false } };
  }
}

function dayOfYear() {
  const now = new Date();
  return Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
}

function getLinkedInSection(config) {
  if (!config.linkedin?.enabled) return null;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = days[new Date().getDay()];
  if (!(config.linkedin.postDays || []).includes(today)) return null;
  const topics = config.linkedin.topics || [];
  return { due: true, topic: topics.length > 0 ? topics[dayOfYear() % topics.length] : null };
}

function getCertSection(config) {
  if (!config.certs?.enabled || !config.certs?.active) return null;
  const topics = config.certs.studyTopics || [];
  return {
    cert: config.certs.active,
    topic: topics.length > 0 ? topics[dayOfYear() % topics.length] : null,
  };
}

async function generateSummary({ pipeline, followUps, resumeQueue, newRoles, linkedin, cert }) {
  const pipelineLine = Object.entries(pipeline)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`)
    .join(', ') || 'empty';

  const actNowList = newRoles.actNowJobs?.map(j => `${j.title} at ${j.company}`).join(', ') || 'none';

  const context = [
    `Pipeline: ${pipelineLine}`,
    `New roles in last 24hrs: ${newRoles.total} total — ${newRoles.actNow} Act Now (${actNowList}), ${newRoles.reviewSoon} Review Soon`,
    `Resume queue: ${resumeQueue.length} tailored resume${resumeQueue.length !== 1 ? 's' : ''} ready to submit`,
    `Follow-ups due: ${followUps.length} application${followUps.length !== 1 ? 's' : ''} from 7-10 days ago with no response`,
    linkedin ? `LinkedIn post due today, suggested topic: "${linkedin.topic}"` : null,
    cert ? `Cert study today: ${cert.cert} - ${cert.topic}` : null,
  ].filter(Boolean).join('\n');

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `You are a personal career assistant giving a concise morning briefing. Based on the job search data below, write exactly 3 sentences highlighting the most important things to focus on today. Be direct, warm, and specific. Do not use em-dashes or en-dashes — use commas or rephrase instead.

${context}

Write only the 3 sentences, nothing else.`,
    }],
  });

  return msg.content[0].text.trim();
}

module.exports = { loadDigestConfig, getLinkedInSection, getCertSection, generateSummary };
