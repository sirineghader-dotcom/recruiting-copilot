// Final step: build the Slack answer. Only candidates that passed the code check can appear,
// and names and CV files come from the database, never from the AI.
const f = $('Apply filters').first().json;
const roles = $('Get roles').all().map(i => i.json).filter(r => r.id);
const role = roles.find(r => f.rules && Number(r.id) === Number(f.rules.role_id));
const allowed = new Map(f.matched.map(c => [Number(c.id), c]));

let matches = [];
let aiNote = '';
let noMatchReason = '';

if (f.matched.length) {
  let answer = null;
  try {
    const r = $input.first().json;
    if (r.error) throw new Error(typeof r.error === 'string' ? r.error : (r.error.description || r.error.message || 'API error'));
    const steps = r.steps || [];
    const output = steps.filter(s => s.type === 'model_output').pop() || steps[steps.length - 1];
    const textPart = ((output && output.content) || []).find(c => c.type === 'text');
    answer = JSON.parse(textPart ? textPart.text : r.output_text);
  } catch (e) {
    aiNote = e.message;
  }

  if (answer) {
    const seen = new Set();
    matches = (answer.matches || [])
      .filter(m => allowed.has(Number(m.candidate_id)) && !seen.has(Number(m.candidate_id)) && seen.add(Number(m.candidate_id)))
      .map(m => ({ c: allowed.get(Number(m.candidate_id)), score: Math.max(0, Math.min(100, Math.round(m.score))), reason: String(m.reason || '').trim() }));
    noMatchReason = answer.no_match_reason || '';
  } else {
    // AI unavailable: still answer, ranked by experience beyond the minimum.
    matches = f.matched.slice(0, 5).map(c => ({
      c, score: Math.min(85, 60 + Math.round(c.extra * 5)),
      reason: `Meets: ${f.rules_text}.\nSkills: ${c.skills.split(', ').slice(0, 4).join(', ')}`
    }));
  }
}

matches = matches.sort((a, b) => b.score - a.score).slice(0, 5).map(m => ({
  candidate_id: Number(m.c.id), name: m.c.full_name, cv_file: m.c.cv_file_name, score: m.score, reason: m.reason
}));

let text;
if (f.problem) {
  text = `:warning: I couldn't understand "${f.question}" right now (${f.problem}). Please ask again in a minute.`;
} else if (!matches.length) {
  const close = f.near_misses.map(n => `• ${n.name}: missing ${n.missing} (:page_facing_up: ${n.cv_file})`).join('\n');
  text = `:mag: *No good match* for "${f.question}".\n` +
    `Nobody meets all of: ${f.rules_text || 'the requirements'}.` +
    (noMatchReason ? `\n${noMatchReason}` : '') +
    (close ? `\n\n*Closest:*\n${close}` : '') +
    `\n\nI won't suggest someone who doesn't fit.`;
} else {
  const lines = matches.map((m, i) =>
    `*${i + 1}. ${m.name}*: ${m.score}/100\n${m.reason.split('\n').map(l => '> ' + l).join('\n')}\n> :page_facing_up: ${m.cv_file}`);
  text = `:mag: *Top ${matches.length}* for "${f.question}"` + (role ? ` (role #${role.id}: ${role.title})` : '') +
    `\n_Checked all candidates for: ${f.rules_text}_` + (aiNote ? `\n_(AI ranking unavailable, ranked by experience)_` : '') +
    `\n\n` + lines.join('\n\n');
}

return [{
  json: {
    question: f.question,
    channel: f.channel,
    role_id: role ? Number(role.id) : 0,
    role_title: role ? role.title : '',
    matches: matches,
    candidate_ids: matches.map(m => m.candidate_id).join(','),
    shortlist_rows: role ? matches.map(m => ({ role_id: Number(role.id), candidate_id: m.candidate_id, score: m.score, reason: m.reason, source_cv: m.cv_file })) : [],
    text: text
  }
}];
