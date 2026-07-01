# Job Search Agent — Claude Instructions

## What this project is

This is an AI-powered job search agent that:
- Scans LinkedIn email alerts from Gmail daily
- Scores and ranks jobs against the user's target companies and keywords
- Posts high-priority roles to Slack in real time
- Sends a morning digest with AI briefing, pipeline health, and follow-up reminders
- Tailors resumes for specific jobs using a two-stage Claude pipeline

It runs on Vercel (free Hobby tier), posts to Slack, and tracks everything in a Google Sheet.

---

## Setup detection — read this first

At the start of every session, check whether this is a **fresh install** or an **already-configured project**:

**Signs this is a fresh install (setup wizard mode):**
- `config/career-facts.js` still contains placeholder text like `[COMPANY NAME]`
- `lib/tailor.js` still contains placeholder text like `[Resume bullet — exact text from your base resume...]`
- `config/contacts.json` is an empty array `[]`
- `.env.local` does not exist
- `node_modules/` does not exist

**Signs it's already configured (normal assistant mode):**
- `.env.local` exists with real values
- `lib/career-facts.js` has real career history
- `config/companies.json` has real company names

If it looks like a fresh install, **enter setup wizard mode** (instructions below). If already configured, **enter normal assistant mode** (instructions at the bottom).

---

## Setup wizard mode

When you detect a fresh install, greet the user and offer to walk them through setup. Something like:

> "It looks like this is a fresh install of the job search agent. I can walk you through the full setup — it takes about 45–60 minutes. I'll run scripts, help you fill in your configuration, and get everything deployed to Vercel. Want to get started?"

Then work through the steps below **in order**, one at a time. After each step, confirm it worked before moving to the next. Never skip ahead.

### Step 1 — Install dependencies

Check if `node_modules/` exists. If not, run:
```
npm install
```

Also create the credentials folder if it doesn't exist:
```
mkdir credentials
```

Confirm both completed successfully.

### Step 2 — Google Cloud setup

This is the most involved part. Walk the user through it verbally — you can't do this part for them since it requires browser clicks in the Google Cloud Console.

Tell them:
1. Go to console.cloud.google.com and create a new project named `job-search-agent`
2. Enable these four APIs (APIs & Services → Library): **Gmail API**, **Google Sheets API**, **Google Drive API**, **Google Docs API**
3. Go to APIs & Services → Credentials → Create Credentials → OAuth client ID
4. If prompted to configure a consent screen: choose External, fill in required fields (app name, email), save through all screens. Then return to create the OAuth client ID.
5. Application type: **Desktop app**. Download the JSON. Rename it `oauth-client.json` and put it in the `credentials/` folder.
6. Go back to the OAuth consent screen and add their email address as a **Test user** (otherwise the next step will fail)

Wait for them to confirm the file is in place, then run:
```
node scripts/auth.js
```

This opens a browser for authorization. Walk them through any prompts (the "app not verified" warning is expected — click Advanced → Go to app). When it completes, the terminal prints a refresh token. Tell them to copy it and save it somewhere safe — they'll need it in Step 6.

Also tell them to open `credentials/oauth-client.json` and copy their `client_id` and `client_secret` values.

Values collected in this step:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

### Step 3 — Slack setup

Walk the user through this verbally:
1. Create a Slack workspace if needed (slack.com — free, personal workspace is fine)
2. Go to api.slack.com/apps → Create New App → From scratch
3. Name it (e.g. "Job Scout"), select their workspace
4. Incoming Webhooks → toggle On → Add New Webhook to Workspace → choose a channel → Allow → copy the webhook URL (`SLACK_WEBHOOK_URL`)
5. OAuth & Permissions → Bot Token Scopes → add: `chat:write`, `channels:read`, `files:upload`, `views:open`
6. Install to Workspace → Allow → copy the Bot User OAuth Token that starts with `xoxb-` (`SLACK_BOT_TOKEN`)
7. Basic Information → App Credentials → Show → copy Signing Secret (`SLACK_SIGNING_SECRET`)

Values collected in this step:
- `SLACK_WEBHOOK_URL`
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`

### Step 4 — Initialize the Google Sheet

Run:
```
node scripts/init-sheet.js
```

This creates the job tracker spreadsheet and prints its ID. Tell them to copy the Sheet ID — this is `GOOGLE_SHEET_ID`.

### Step 5 — Configure their profile

Help the user fill in each config file interactively. Ask them the questions and write the files for them:

**`config/companies.json`** — ask: "Which specific companies are you most excited about? I'll add those as Tier 1. Any others worth tracking at a lower priority?" Also ask what job titles they're searching for.

**`config/referrals.json`** — ask: "Do you have any confirmed referral contacts at specific companies? Someone who's said they'll refer you?" If yes, add them.

**`config/digest.json`** — ask: "Do you want a daily reminder to post on LinkedIn? And are you studying for any certifications right now?" Enable/disable sections based on their answer.

**`lib/career-facts.js`** — this is the most important one for resume tailoring. Tell the user:
> "The career facts file is what the AI uses to tailor your resume. The more specific you are — team sizes, dollar amounts, outcomes — the better the tailored resumes will be. Let's go through your last 2-3 roles and I'll fill this in for you. Tell me about your most recent job."

Ask questions, fill in facts as they answer. Cover: company name, title, dates, team size, budget, key outcomes with metrics, technologies used, notable initiatives.

**`lib/resume.js`** — ask what their full name is (for the resume filename). Note that the actual base resume Doc ID and tailored folder ID come from Google Drive and will be set as env vars in the next step.

### Step 5b — Populate base resume content in tailor.js

`lib/tailor.js` contains the actual resume text the AI edits during tailoring — the profile paragraph, areas of expertise, and bullet points per role. The tailoring pipeline does find/replace against this text, so it must match what's in their Google Drive resume exactly.

Tell the user:
> "Now I need the actual text from your resume — your professional summary, skill areas, and bullet points for each role. You can paste sections directly and I'll format them, or just walk me through each role and I'll draft the bullets for you to review."

Ask and fill in:
- **Profile/summary** — their current professional summary or top-of-resume statement
- **Areas of expertise** — 4–6 skill or domain areas (usually a keyword list near the top of the resume)
- **Bullets per role** — exact bullet text for each role, most recent first. Prompt: "What did you accomplish at [Company]? Give me the highlights and I'll turn them into resume bullets."

Write the collected content into `PROFILES['default']` and `RESUME_CONTENT['default']` in `lib/tailor.js`.

If they maintain more than one resume version targeting different role types, ask: "Do you have more than one resume version — for example, one framed toward TPM roles and one toward general PM?" If yes, add additional keys (e.g. `'tpm'`) following the same shape as `'default'`.

Before moving on, confirm the file has no remaining placeholder brackets like `[...]`.

### Step 6 — Generate a CRON_SECRET

Run this to generate a secure random token:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Tell them to copy the output — this is their `CRON_SECRET`.

### Step 7 — Deploy to Vercel

Walk them through:
1. Go to vercel.com/new → Import their forked repo → Deploy (first deploy may fail — that's fine)
2. Go to project Settings → Environment Variables
3. Add all of these (collected across previous steps):

| Variable | Source |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `GOOGLE_CLIENT_ID` | From Step 2 |
| `GOOGLE_CLIENT_SECRET` | From Step 2 |
| `GOOGLE_REFRESH_TOKEN` | From Step 2 |
| `GOOGLE_SHEET_ID` | From Step 4 |
| `SLACK_WEBHOOK_URL` | From Step 3 |
| `SLACK_BOT_TOKEN` | From Step 3 |
| `SLACK_SIGNING_SECRET` | From Step 3 |
| `CRON_SECRET` | From Step 6 |
| `RESUME_FULL_NAME` | Their full name |
| `GOOGLE_DRIVE_BASE_RESUME_ID` | (optional, for resume tailoring — skip for now) |
| `GOOGLE_DRIVE_TAILORED_FOLDER_ID` | (optional, for resume tailoring — skip for now) |

4. After adding all vars, go to Deployments → Redeploy

### Step 8 — First test run

Once the deployment goes green, run these two commands (replace values accordingly):

```
curl -s "https://[their-project].vercel.app/api/discover" -H "Authorization: Bearer [CRON_SECRET]"
```

Then after a minute:
```
curl -s "https://[their-project].vercel.app/api/digest" -H "Authorization: Bearer [CRON_SECRET]"
```

Tell them to check Slack — they should see a message appear. If discover returns `{"found":0}`, reassure them that's normal if no LinkedIn alert emails have arrived yet.

### Finishing up

Once setup is complete:
1. Remind them to set up LinkedIn job alerts if they haven't already (LinkedIn Jobs → search → toggle Job Alert on)
2. Save a recap of what was configured to memory so you can pick up context in future sessions
3. Tell them the agent will now run automatically every morning at 7:00am (job scan) and 7:30am (digest) — both times are based on UTC offset, and they can adjust `vercel.json` if they want a different time

---

## Normal assistant mode

When the project is already configured, your role is:
- Help the user add new companies or referrals to config files and push changes
- Debug issues with the discover, digest, or tailoring endpoints (check Vercel logs)
- Help tune scoring when job quality feels off
- Help update career facts when the user has new accomplishments to add
- Help adjust cron timing in `vercel.json`
- Help set up resume tailoring if they skipped it during initial setup

### Key files to know

| File | Purpose |
|---|---|
| `config/companies.json` | Target companies (Tier 1/2) and keyword matching |
| `config/referrals.json` | Confirmed referral contacts (+2 pts per job) |
| `config/digest.json` | LinkedIn/cert prompts in morning digest |
| `lib/career-facts.js` | Career history used for AI resume tailoring |
| `lib/scoring.js` | Job scoring logic — tune weights here |
| `vercel.json` | Cron schedule (UTC times) |

### Manual triggers

```bash
# Run job discovery manually
curl -s "https://[project].vercel.app/api/discover" -H "Authorization: Bearer [CRON_SECRET]"

# Run morning digest manually
curl -s "https://[project].vercel.app/api/digest" -H "Authorization: Bearer [CRON_SECRET]"
```

### Cron timing

Times in `vercel.json` are UTC. Convert to local time:
- CDT (summer, US Central): subtract 5 hours from UTC
- CST (winter, US Central): subtract 6 hours from UTC
- ET (summer): subtract 4 hours from UTC

Current schedule: `0 12` (7am CDT) for discover, `30 12` (7:30am CDT) for digest.

### Common issues

- **Discover returns 0 jobs**: LinkedIn alert emails haven't arrived yet, or are going to a different Gmail address than the one authorized
- **Auth / invalid_grant error**: Refresh token expired — user needs to re-run `node scripts/auth.js` and update `GOOGLE_REFRESH_TOKEN` in Vercel
- **Digest Slack 400 error**: Block text exceeded Slack's 3,000 char limit — usually caused by too many Act Now jobs with long URLs. Act Now list is capped at 5 in the current build.
- **Resume tailoring fails**: Check that `GOOGLE_DRIVE_BASE_RESUME_ID` and `GOOGLE_DRIVE_TAILORED_FOLDER_ID` are set in Vercel env vars
