// Find the candidate pipeline and its stage IDs in GHL (names are matched loosely).
const s = $('Settings').first().json;
const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const pipeline = ($input.first().json.pipelines || []).find(p => norm(p.name) === norm(s.pipeline_name));
if (!pipeline) throw new Error(`GHL pipeline "${s.pipeline_name}" not found. Create it in GHL (Opportunities > Pipelines) first.`);

const stages = Object.fromEntries(pipeline.stages.map(st => [norm(st.name), st.id]));
if (!stages.outreachsent) throw new Error(`The pipeline "${pipeline.name}" needs a stage called "Outreach Sent".`);

return [{
  json: {
    pipeline_id: pipeline.id,
    pipeline_name: pipeline.name,
    stages: stages,                                                       // "outreachsent" -> stage id
    stage_names: Object.fromEntries(pipeline.stages.map(st => [st.id, st.name]))  // stage id -> "Outreach Sent"
  }
}];
