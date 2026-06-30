const path = require('path');

let _contacts = null;

function loadContacts() {
  if (_contacts) return _contacts;
  try {
    _contacts = require('../config/contacts.json');
  } catch {
    _contacts = [];
  }
  return _contacts;
}

const FORMER_PATTERNS = /\b(former|ex-|previously|retired|alumni|alum|past)\b/i;

/**
 * Returns contacts currently employed at a company that fuzzy-matches the given name.
 * Checks both directions so "Salesforce" matches "Salesforce.com, Inc." and vice versa.
 * Excludes contacts whose company field suggests former employment.
 */
function findContactsAtCompany(companyName) {
  if (!companyName) return [];
  const needle = companyName.toLowerCase();
  return loadContacts().filter(c => {
    const company = c.company || '';
    if (FORMER_PATTERNS.test(company)) return false;
    const haystack = company.toLowerCase();
    return haystack.includes(needle) || needle.includes(haystack);
  });
}

module.exports = { findContactsAtCompany };
