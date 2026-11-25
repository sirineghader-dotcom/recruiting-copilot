# AI Recruiting Copilot

A recruiting assistant for a remote-staffing agency, built with **n8n, GoHighLevel, Gemini, Slack and Supabase**.
It turns client call notes into job descriptions, finds the best 5 candidates for a plain-English question,
and runs outreach. A recruiter approves every step.

## How it works

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| 1. CV pipeline | Upload form | Reads PDF/Word CVs (including scans) with Gemini, removes duplicates, keeps the newest CV, flags unreadable files |
| 2. Job description approval | Transcript form | Gemini writes a job description from a call transcript → Slack Approve/Reject → saved as an open role |
| 3. Slack search bot | `@Recruiting copilot` mention | Plain-English question → top 5 candidates with score, 2-line reason and source CV, or "no good match" → approve outreach |
| 4. Outreach | Approved shortlist (checked every minute) | Sends each approved candidate to a GHL inbound-webhook workflow, which creates the contact + opportunity and starts an email sequence that stops when they reply. Reads GHL stages back into Supabase |
| 5. Portal data | Portal page load | Returns roles, shortlists, pipeline stages and test results to the portal (n8n holds the database key, the browser holds none) |

**The rules, and where they are enforced**
- *Nothing reaches a candidate or client until a recruiter clicks Approve*: Slack "send and wait" approval nodes in workflows 2 and 3.
- *No good match? The bot says so*: the search prompt only keeps candidates meeting every requirement; an empty result is answered with what was missing.
- *Never invents a candidate*: `parse_matches.js` drops any candidate id that is not in the database.
- *Every recommendation names its CV*: the CV file name comes from the database, never from the AI.
- *Unreadable CVs are flagged, never skipped*: every file gets a row in `cv_files`, including failures with the reason.

## Recruiter portal

`docs/index.html`, hosted with GitHub Pages: open roles with their shortlists, candidates per pipeline stage,
and a test page with 10 questions, the right answers, and the bot's score out of 10.
The Slack bot logs every answer (`bot_answers`), and the test page grades the latest answer to each question.

## Project layout

```
data/
  transcripts/       5 fake client call transcripts (one per role)
  cvs/               60 fake CVs (PDF + Word) for 55 unique people
  answer_key.json    ground truth: who has which skills, for how many years
scripts/
  candidates.py      the fake candidate pool (edit this to change a CV)
  generate_cvs.py    renders candidates.py into data/cvs + answer_key.json
  build_workflows.py builds the importable n8n workflows from n8n/code/
supabase/
  schema.sql         tables
  process_cv.sql     dedupe / version / unreadable logic for each CV
  search.sql         candidate_profiles view used by the search bot
  portal.sql         test questions, bot answer log, portal_data() for the portal
docs/
  index.html         the recruiter portal
n8n/
  code/              the JavaScript inside every Code node
  *.json             workflows to import into n8n
```

Regenerate the CVs: `python3 scripts/generate_cvs.py`
Rebuild the workflow files: `python3 scripts/build_workflows.py`

## The 5 open roles

| # | Role | Client | Must-haves |
|---|------|--------|------------|
| 1 | GoHighLevel Automation Specialist | Lone Star Growth Media, Austin TX | 2+ yrs GHL, Zapier or n8n, fluent English (Arabic = big plus) |
| 2 | Bilingual Customer Support Rep | BrightSmile Dental Group, Florida | Fluent English + Spanish, 1+ yr phone/chat support, Zendesk or Freshdesk |
| 3 | Medical Virtual Assistant | ClearPath Telehealth, San Diego CA | 2+ yrs medical admin, HIPAA training, athenahealth or eClinicalWorks |
| 4 | Performance Marketing Specialist | Glow Theory Skincare, Brooklyn NY | 3+ yrs Meta + Google Ads, $20k+/mo spend managed, GA4 |
| 5 | Bookkeeper | Kowalski & Byrne CPAs, Chicago IL | 3+ yrs QuickBooks Online, reconciliations, US client experience |

## Deliberately messy data

| Case | Files | What the system must do |
|------|-------|-------------------------|
| Scanned, image-only CV | `scan_0012.pdf` (Esther Wanjiru) | Read it, or flag it. Never skip it silently |
| Same person submitted twice | Maria Santos, Rahul Mehta, Andrea Gómez | Keep one candidate (matched by email) |
| Updated CV | Youssef Benali (2025 → 2026), Grace Villanueva (2024 → 2026) | The newer CV replaces the old one |

Other traps on purpose: the same tool written different ways ("GoHighLevel", "HighLevel", "Go High Level", "GHL"),
four different date formats, a Word CV built entirely from a table, near-miss candidates
(e.g. 1 year of GHL when 2 are required), and 5 people who fit no role at all.

## Design choices

- **Database: Supabase (Postgres).** Duplicate and version handling live in one database function (`process_cv`),
  so two uploads at once can never create the same person twice. All tables are locked (row level security);
  only n8n's secret key can read or write.
- **AI: Gemini free tier.** The workflows call the Gemini Interactions API with a JSON schema, so the AI must answer
  in an exact structure. Free-tier requests may be used by Google to improve its products; all data here is fake.
- **Years of experience are counted by code, not by the AI.** Gemini lists which skills each job used
  (only what that job's own text says); code adds up the months, counting overlapping jobs once.
  The first version let the AI do the arithmetic, and the test page caught two mistakes on medical CVs.
- **Scoring:** 60 points for meeting every requirement, up to 25 for experience beyond the minimum,
  up to 15 for nice-to-haves.
- **Pipeline stages:** shortlisted → approved → contacted → replied → interview → placed / rejected.

## Safety note

Every candidate email uses `example.com/.org/.net`. Those domains can never receive mail,
so outreach tests can't reach a real person. For the Loom demo, change one candidate's email
to your own inbox.
