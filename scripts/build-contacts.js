/**
 * Processes LinkedIn Connections.csv into config/contacts.json.
 * Run locally whenever you export a fresh LinkedIn data dump:
 *   node scripts/build-contacts.js
 */

const fs = require('fs');
const path = require('path');

const CSV_PATH = process.env.CONNECTIONS_CSV ||
  path.join('C:\\MTM_Notes\\Job Search\\linkedin-data\\Connections.csv');
const OUT_PATH = path.join(__dirname, '../config/contacts.json');

const raw = fs.readFileSync(CSV_PATH, 'utf8');
const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

// LinkedIn export has 3 preamble lines before the header row
const headerIdx = lines.findIndex(l => l.startsWith('First Name'));
if (headerIdx === -1) {
  console.error('Could not find header row in CSV');
  process.exit(1);
}

const headers = lines[headerIdx].split(',').map(h => h.replace(/^"|"$/g, '').trim());
const firstNameIdx = headers.indexOf('First Name');
const lastNameIdx  = headers.indexOf('Last Name');
const companyIdx   = headers.indexOf('Company');
const positionIdx  = headers.indexOf('Position');

// Proper CSV line parser — handles empty fields and quoted fields with commas
function parseCSVLine(line) {
  const cols = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && !(line[j] === '"' && line[j + 1] !== '"')) j++;
      cols.push(line.slice(i + 1, j).replace(/""/g, '"'));
      i = j + 2;
    } else {
      const j = line.indexOf(',', i);
      const end = j === -1 ? line.length : j;
      cols.push(line.slice(i, end).trim());
      i = end + 1;
    }
    if (i > line.length) break;
  }
  return cols;
}

const connectedOnIdx = headers.indexOf('Connected On');

const contacts = lines.slice(headerIdx + 1).map(line => {
  const cols = parseCSVLine(line);
  const get = i => (cols[i] || '').trim();
  return {
    name: `${get(firstNameIdx)} ${get(lastNameIdx)}`.trim(),
    company: get(companyIdx),
    position: get(positionIdx),
    connectedOn: connectedOnIdx >= 0 ? get(connectedOnIdx) : null,
  };
}).filter(c => c.name && c.company);

fs.writeFileSync(OUT_PATH, JSON.stringify(contacts, null, 2));
console.log(`Wrote ${contacts.length} contacts to config/contacts.json`);
