-- process_cv: decides what to do with one extracted CV, saves it, and logs the file.
-- Called once per CV from n8n. Returns {"outcome": ..., "candidate_id": ..., "note": ...}.
--
-- Outcomes (same list as the cv_files table):
--   unreadable_flagged     the AI could not read it (or found no email)  -> logged, never skipped
--   new                    first CV for this email                       -> candidate created
--   replaced_older         newer CV for a known email                    -> candidate updated
--   duplicate_ignored      same CV again (same or unknown date)          -> nothing changes
--   older_version_ignored  older CV than the one we already have         -> nothing changes

create or replace function process_cv(p jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_email    text := lower(trim(coalesce(p->>'email', '')));
  v_file     text := coalesce(p->>'fileName', 'unknown file');
  v_new_date date := case when coalesce(p->>'cv_updated', '') ~ '^\d{4}-\d{2}$'
                          then to_date(p->>'cv_updated', 'YYYY-MM') end;
  v_existing candidates%rowtype;
  v_id       bigint;
  v_outcome  text;
  v_note     text;
begin
  -- 1. Unreadable: log it so a human sees it.
  if coalesce((p->>'readable')::boolean, false) = false or v_email = '' then
    v_note := coalesce(nullif(p->>'unreadable_reason', ''), 'No email address found');
    insert into cv_files (file_name, outcome, note) values (v_file, 'unreadable_flagged', v_note);
    return jsonb_build_object('outcome', 'unreadable_flagged', 'candidate_id', null, 'note', v_note);
  end if;

  select * into v_existing from candidates where email = v_email;

  -- 2. Decide.
  if not found then
    v_outcome := 'new';
  elsif v_new_date is not null and (v_existing.cv_updated is null or v_new_date > v_existing.cv_updated) then
    v_outcome := 'replaced_older';
    v_note := 'Replaced ' || v_existing.cv_file_name;
  elsif v_new_date is not null and v_new_date < v_existing.cv_updated then
    v_outcome := 'older_version_ignored';
    v_note := 'Kept the newer ' || v_existing.cv_file_name;
  else
    v_outcome := 'duplicate_ignored';
    v_note := 'Same CV as ' || v_existing.cv_file_name;
  end if;

  -- 3. Save (only for new or newer CVs).
  if v_outcome = 'new' then
    insert into candidates (email, full_name, phone, location, headline, summary, languages,
                            cv_file_name, cv_updated, cv_text)
    values (v_email, p->>'full_name', p->>'phone', p->>'location', p->>'headline', p->>'summary',
            array(select lower(jsonb_array_elements_text(coalesce(p->'languages', '[]')))),
            v_file, v_new_date, p->>'cv_text')
    returning id into v_id;
  elsif v_outcome = 'replaced_older' then
    v_id := v_existing.id;
    update candidates set
      full_name = p->>'full_name', phone = p->>'phone', location = p->>'location',
      headline = p->>'headline', summary = p->>'summary',
      languages = array(select lower(jsonb_array_elements_text(coalesce(p->'languages', '[]')))),
      cv_file_name = v_file, cv_updated = v_new_date, cv_text = p->>'cv_text', updated_at = now()
    where id = v_id;
    delete from candidate_skills where candidate_id = v_id;
  else
    v_id := v_existing.id;
  end if;

  if v_outcome in ('new', 'replaced_older') then
    insert into candidate_skills (candidate_id, skill, years)
    select v_id, lower(s->>'skill'), max(coalesce((s->>'years')::numeric, 0))
    from jsonb_array_elements(coalesce(p->'skills', '[]')) s
    where coalesce(s->>'skill', '') <> ''
    group by lower(s->>'skill');
  end if;

  -- 4. Always log the file.
  insert into cv_files (file_name, candidate_id, outcome, note) values (v_file, v_id, v_outcome, v_note);
  return jsonb_build_object('outcome', v_outcome, 'candidate_id', v_id, 'note', v_note);
end;
$$;

-- Only n8n (secret key) may call this. Block the public keys the portal will use.
revoke execute on function process_cv(jsonb) from public, anon, authenticated;
grant execute on function process_cv(jsonb) to service_role;
