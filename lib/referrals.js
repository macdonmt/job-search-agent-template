const referrals = require('../config/referrals.json');

/**
 * Returns confirmed referral data for a company, or null if none exists.
 * Fuzzy-matches so "CVS Health" matches the "CVS" key, and vice versa.
 */
function getReferral(companyName) {
  if (!companyName) return null;
  const needle = companyName.toLowerCase();
  for (const [key, data] of Object.entries(referrals)) {
    const k = key.toLowerCase();
    if (needle.includes(k) || k.includes(needle)) return data;
  }
  return null;
}

module.exports = { getReferral };
