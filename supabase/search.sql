-- One row per candidate with everything the search bot needs.
-- security_invoker = true makes the view respect the table locks (RLS),
-- so only n8n's secret key can read it, never the public portal key.
create or replace view candidate_profiles with (security_invoker = true) as
select
  c.id,
  c.full_name,
  c.headline,
  c.location,
  c.languages,
  c.cv_file_name,
  c.summary,
  c.cv_text,
  coalesce((select string_agg(s.skill || ' ' || s.years || 'y', ', ' order by s.years desc)
            from candidate_skills s where s.candidate_id = c.id), '') as skills
from candidates c;

revoke all on candidate_profiles from anon, authenticated;
