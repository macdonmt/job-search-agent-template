const RULES = [
  { points: 3, test: job => job.tier === 1 },
  { points: 2, test: job => job.tier === 2 },
  { points: 2, test: job => job.confirmedReferral === true },
  { points: 2, test: job => (job.contactCount || 0) >= 1 },
  { points: 1, test: job => (job.contactCount || 0) >= 2 },
  { points: 1, test: job => (job.contactCount || 0) >= 3 },
  { points: 2, test: job => /director|sr\.? manager|senior manager/i.test(job.title) },
  { points: 1, test: job => /remote|hybrid/i.test(job.location + ' ' + (job.officeType || '')) },
  { points: 1, test: job => /chicago/i.test(job.location) },
  { points: 1, test: job => /fintech|payment|fraud|risk/i.test(job.title + ' ' + (job.company || '')) },
];

function fieldValue(job, field) {
  return [job.title, job.company, job.location, job.officeType].join(' ');
}

function applyContext(job, context) {
  if (!context) return job;

  const searchText = [job.title, job.company, job.location, job.officeType]
    .filter(Boolean).join(' ');

  for (const d of (context.hardDisqualifiers || [])) {
    if (new RegExp(d.pattern, 'i').test(searchText)) {
      return { ...job, status: 'Not Recommended' };
    }
  }

  let scoreDelta = 0;
  for (const a of (context.scoreAdjustments || [])) {
    if (new RegExp(a.pattern, 'i').test(searchText)) {
      scoreDelta += a.delta;
    }
  }

  return scoreDelta !== 0 ? { ...job, score: Math.max(0, (job.score || 0) + scoreDelta) } : job;
}

function scoreJob(job, context) {
  const score = RULES.reduce((sum, rule) => sum + (rule.test(job) ? rule.points : 0), 0);
  const priority = score >= 7 ? 'Act Now' : score >= 4 ? 'Review Soon' : 'On Radar';
  return applyContext({ ...job, score, priority }, context);
}

function scoreJobs(jobs, context) {
  return jobs.map(j => scoreJob(j, context)).sort((a, b) => b.score - a.score);
}

module.exports = { scoreJobs };
