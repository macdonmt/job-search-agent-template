# AI Job Search Agent

A self-hosted job search assistant that scans your LinkedIn email alerts daily, scores every role against your criteria, and posts the best matches to Slack — with AI-powered resume tailoring built in.

## What it does

- **Daily job scanning** — reads LinkedIn alert emails from Gmail, parses each job with Claude AI, deduplicates against your history
- **Smart scoring** — ranks jobs by your target companies, keywords, location, and confirmed referrals
- **Slack alerts** — high-priority roles posted immediately with direct links
- **Morning digest** — 7:30am summary with AI briefing, pipeline health, resume queue, and follow-up reminders
- **Google Sheet tracker** — every job logged with status tracking and scoring details
- **AI resume tailoring** — two-stage Claude pipeline generates a tailored Google Doc per application

## Cost

The only paid service is an Anthropic API key. At typical job search volumes, expect roughly **$5–15/month** in API usage. Google, Slack, and Vercel Hobby are all free.

## Setup

### Recommended: Set up with Claude Code

The fastest way to get running is to open this repo with [Claude Code](https://claude.ai/code) — it reads the included `CLAUDE.md` and walks you through every step interactively, runs setup scripts for you, and helps you fill in your configuration.

```bash
# Install Claude Code if you haven't already
npm install -g @anthropic-ai/claude-code

# Clone your fork and open it with Claude
git clone https://github.com/yourusername/job-search-agent.git
cd job-search-agent
claude
```

Then just tell Claude: **"I want to set up the job search agent."** It takes it from there.

### Manual setup

If you prefer to set things up yourself, follow the step-by-step HTML guide:

> **[Full Setup Guide →](https://yourusername.github.io/job-search-agent)**

The guide covers every step in detail: Google Cloud API setup, Slack app creation, Vercel deployment, and configuration.

## What you need before starting

- GitHub, Google, Slack, Vercel, and Anthropic accounts (all free except Anthropic credits)
- Node.js LTS installed
- A LinkedIn account with job alert emails going to your Gmail

## Project structure

```
api/
  discover.js          # Daily job scan cron
  digest.js            # Morning digest cron
  resume/              # Resume tailoring endpoints
  webhook/             # Slack interaction handlers
config/
  companies.json       # Your target companies and keywords
  referrals.json       # Confirmed referral contacts
  digest.json          # Morning digest preferences
  contacts.json        # Built from LinkedIn export (optional)
lib/
  career-facts.js      # Your career history for resume tailoring
  scoring.js           # Job scoring logic
  tailor.js            # AI resume tailoring pipeline
scripts/
  auth.js              # One-time Google OAuth authorization
  init-sheet.js        # Creates your Google Sheet tracker
  build-contacts.js    # Builds contacts.json from LinkedIn export
vercel.json            # Cron schedule (7am discover, 7:30am digest)
```

## Customization

- **Target companies and roles** → `config/companies.json`
- **Confirmed referrals** → `config/referrals.json`
- **Digest preferences** → `config/digest.json`
- **Resume tailoring** → `lib/career-facts.js`
- **Cron timing** → `vercel.json` (times are UTC)

## License

MIT
