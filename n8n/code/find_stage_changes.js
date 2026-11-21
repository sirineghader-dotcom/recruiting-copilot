// Copy pipeline stages from GHL back to Supabase, so the portal shows where each candidate is.
const info = $('Find pipeline').first().json;
const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const GHL_TO_DB = {
  approved: 'approved', outreachsent: 'contacted', replied: 'replied', interview: 'interview',
  submittedtoclient: 'interview', placed: 'placed', notafit: 'rejected'
};

const current = new Map($('Get current stages').all().map(i => i.json).filter(r => r.role_id)
  .map(r => [`${r.role_id}-${r.candidate_id}`, r.stage]));

const changes = [];
for (const o of ($('Get SG opportunities').first().json.opportunities || [])) {
  const m = String(o.name || '').match(/role (\d+), candidate (\d+)/);
  if (!m) continue;                                         // not created by this workflow
  const stage = GHL_TO_DB[norm(info.stage_names[o.pipelineStageId])];
  const key = `${m[1]}-${m[2]}`;
  if (stage && current.has(key) && current.get(key) !== stage) {
    changes.push({ json: { role_id: Number(m[1]), candidate_id: Number(m[2]), stage: stage } });
  }
}
return changes;
