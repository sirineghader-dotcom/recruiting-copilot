-- AI Recruiting Copilot: database schema
-- Paste into Supabase > SQL Editor > New query, then Run.

-- One row per job. Created from a client call transcript.
create table roles (
  id              bigint generated always as identity primary key,
  title           text not null,
  client_name     text not null,
  transcript      text not null,
  job_description text,                          -- written by the AI
  must_haves      text[] default '{}',
  nice_to_haves   text[] default '{}',
  jd_status       text not null default 'draft'
                  check (jd_status in ('draft', 'pending_approval', 'approved', 'rejected')),
  approved_by     text,
  approved_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- One row per PERSON. The unique email is what stops duplicates.
create table candidates (
  id              bigint generated always as identity primary key,
  email           text not null unique,
  full_name       text not null,
  phone           text,
  location        text,
  headline        text,
  summary         text,
  languages       text[] default '{}',           -- lowercase, e.g. {arabic, english}
  cv_file_name    text not null,                 -- the CV every answer must cite
  cv_updated      date,                          -- used to decide which CV is newer
  cv_text         text,                          -- full text, for searching
  search_vector   tsvector generated always as (to_tsvector('english', coalesce(cv_text, ''))) stored,
  ghl_contact_id  text,                          -- filled once pushed to GoHighLevel
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index candidates_search_idx on candidates using gin (search_vector);

-- One row per skill per person, e.g. (Omar, 'gohighlevel', 4.3).
create table candidate_skills (
  candidate_id    bigint not null references candidates(id) on delete cascade,
  skill           text not null,                 -- normalized lowercase name
  years           numeric(4,1) not null default 0,
  primary key (candidate_id, skill)
);

-- One row per FILE received. Nothing is ever skipped silently.
create table cv_files (
  id              bigint generated always as identity primary key,
  file_name       text not null,
  candidate_id    bigint references candidates(id) on delete set null,
  outcome         text not null
                  check (outcome in ('new', 'replaced_older', 'duplicate_ignored',
                                     'older_version_ignored', 'unreadable_flagged')),
  note            text,
  received_at     timestamptz not null default now()
);

-- One row per candidate suggested for a role. Also tracks the pipeline stage.
create table shortlists (
  id              bigint generated always as identity primary key,
  role_id         bigint not null references roles(id) on delete cascade,
  candidate_id    bigint not null references candidates(id) on delete cascade,
  score           int check (score between 0 and 100),
  reason          text,                          -- the 2-line explanation
  source_cv       text not null,                 -- file name the recommendation came from
  stage           text not null default 'shortlisted'
                  check (stage in ('shortlisted', 'approved', 'contacted', 'replied',
                                   'interview', 'placed', 'rejected')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (role_id, candidate_id)
);

-- The 10 test questions for the portal's test page.
create table test_questions (
  id                  bigint generated always as identity primary key,
  question            text not null,
  expected_answer     text not null,             -- names, or 'no match'
  bot_answer          text,
  passed              boolean,
  last_run_at         timestamptz
);

-- Lock every table by default. n8n uses the secret key, which bypasses this.
alter table roles            enable row level security;
alter table candidates       enable row level security;
alter table candidate_skills enable row level security;
alter table cv_files         enable row level security;
alter table shortlists       enable row level security;
alter table test_questions   enable row level security;
