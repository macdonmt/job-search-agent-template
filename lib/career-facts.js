/**
 * Career Facts Inventory — source of truth for AI resume tailoring.
 * Every fact here is real and verifiable. Opus may draw from this inventory
 * to enrich or replace resume bullets. Nothing here should be fabricated or inferred.
 *
 * Instructions:
 * - Fill in each section with your actual career history
 * - Be specific: team sizes, budgets, outcome percentages, technologies
 * - Delete sections that don't apply; add new ones as needed
 * - The AI will only use facts listed here — never fabricate beyond this file
 */

const CAREER_FACTS = `
CAREER FACTS INVENTORY
Every fact below is real and verifiable. Use these to ground resume bullets — never fabricate beyond what is here.

═══════════════════════════════════════
[COMPANY NAME] — [MOST RECENT ROLE]
[Title] | [Start Date]–present
═══════════════════════════════════════
SCALE & SCOPE
- [e.g. X direct reports, Y teams, Z products, $NM budget]

KEY OUTCOMES
- [Specific, measurable result — what shipped, what improved, by how much]
- [Another outcome]

TECHNOLOGIES & TOOLS
- [List the tools, platforms, languages relevant to this role]

NOTABLE INITIATIVES
- [Name of initiative]: [what it was, your role, the result]

═══════════════════════════════════════
[COMPANY NAME] — [PREVIOUS ROLE]
[Title] | [Start Date]–[End Date]
═══════════════════════════════════════
SCALE & SCOPE
- [e.g. team size, revenue impact, number of clients]

KEY OUTCOMES
- [Specific, measurable result]
- [Another outcome]

TECHNOLOGIES & TOOLS
- [List relevant tools and platforms]

NOTABLE INITIATIVES
- [Name of initiative]: [what it was, your role, the result]

═══════════════════════════════════════
[COMPANY NAME] — [EARLIER ROLE]
[Title] | [Start Date]–[End Date]
═══════════════════════════════════════
SCALE & SCOPE
- [e.g. team size, client count, project size]

KEY OUTCOMES
- [Specific, measurable result]

TECHNOLOGIES & TOOLS
- [List relevant tools and platforms]

═══════════════════════════════════════
CROSS-CUTTING FACTS (apply across all roles)
═══════════════════════════════════════
- [A skill or fact that spans multiple roles, e.g. "Led teams from 5 to 50+ people across all roles"]
- [Industry knowledge, certifications, or consistent patterns worth calling out]
- [Any regulated environments, compliance experience, or other cross-cutting context]
`;

module.exports = { CAREER_FACTS };
