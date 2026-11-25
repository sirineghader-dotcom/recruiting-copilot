-- Portal + test page. Paste into Supabase > SQL Editor > New query, then Run.
-- The portal never talks to Supabase directly (no key in browser code): it calls an n8n webhook,
-- and n8n calls portal_data() with its secret key. portal_data() returns no emails, phones or CV text.

-- Every answer the Slack bot gives, so the test page can grade it.
create table if not exists bot_answers (
  id              bigint generated always as identity primary key,
  question        text not null,
  answer_text     text,
  candidate_names text[] default '{}',          -- empty = the bot said "no good match"
  role_id         bigint,
  asked_at        timestamptz not null default now()
);
alter table bot_answers enable row level security;

-- The 10 test questions and the right answers (from data/answer_key.json).
-- expected_answer: the exact set of names, separated by "; ", or "no match".
truncate test_questions;
insert into test_questions (question, expected_answer) values
  ('Who has 4+ years of GoHighLevel and speaks Arabic?', 'Omar Haddad'),
  ('Who has 6+ years of QuickBooks Online and US client experience?', 'Mark Anthony Bautista; Ferdinand Ocampo'),
  ('Who has 3+ years of medical admin, HIPAA training and athenahealth?', 'Grace Villanueva; Mariam Saleh; Rosa Martínez; Michelle Tan'),
  ('Who has 5+ years of Salesforce?', 'no match'),
  ('Who speaks Spanish and has 3+ years of Zendesk?', 'Andrea Gómez; Camila Torres; Sara Benjelloun'),
  ('Who has 7+ years of Meta Ads?', 'Sofía Ramírez; Thandiwe Mokoena'),
  ('Who knows Xero and speaks French?', 'Lina Khoury'),
  ('Who has 4+ years of eClinicalWorks?', 'Esther Wanjiru; Michelle Tan'),
  ('Who has n8n experience and phone support experience?', 'Youssef Benali'),
  ('Who speaks Japanese and has 2+ years of customer support?', 'no match');

-- Everything the portal shows, in one call.
create or replace function portal_data()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'stats', jsonb_build_object(
      'candidates', (select count(*) from candidates),
      'cv_files',   (select count(*) from cv_files),
      'flagged',    (select count(*) from cv_files where outcome = 'unreadable_flagged')),
    'roles', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'client', r.client_name, 'must_haves', r.must_haves,
        'job_description', r.job_description,
        'shortlist', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'name', c.full_name, 'score', s.score, 'reason', s.reason, 'cv', s.source_cv, 'stage', s.stage)
            order by s.score desc nulls last), '[]'::jsonb)
          from shortlists s join candidates c on c.id = s.candidate_id
          where s.role_id = r.id)
      ) order by r.id), '[]'::jsonb)
      from roles r where r.jd_status = 'approved'),
    'pipeline', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', c.full_name, 'role_id', s.role_id, 'role', r.title, 'stage', s.stage,
        'score', s.score, 'cv', s.source_cv, 'updated_at', s.updated_at)
        order by s.updated_at desc), '[]'::jsonb)
      from shortlists s join candidates c on c.id = s.candidate_id join roles r on r.id = s.role_id),
    'tests', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'question', t.question, 'expected', t.expected_answer,
        'bot', (
          select jsonb_build_object('names', b.candidate_names, 'text', b.answer_text, 'asked_at', b.asked_at)
          from bot_answers b
          where regexp_replace(lower(b.question), '[^a-z0-9]', '', 'g')
              = regexp_replace(lower(t.question), '[^a-z0-9]', '', 'g')
          order by b.asked_at desc limit 1)
      ) order by t.id), '[]'::jsonb)
      from test_questions t)
  );
$$;

-- Only n8n (secret key) may call it.
revoke execute on function portal_data() from public, anon, authenticated;
grant execute on function portal_data() to service_role;
