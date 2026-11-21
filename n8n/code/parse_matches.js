// Check Gemini's answer against the real database before showing it to anyone.
// Only candidates that exist in the database survive, and names and CV files come
// from the database, not from the AI, so every recommendation cites a real CV.
const reply = $input.first().json;
const req = $('Build search request').first().json;
const candidates = $('Get candidates').all().map(i => i.json).filter(c => c.id);
const roles = $('Get roles').all().map(i => i.json).filter(r => r.id);
const byId = new Map(candidates.map(c => [Number(c.id), c]));

let answer = null;
let problem = '';
try {
  if (reply.error) throw new Error(typeof reply.error === 'string' ? reply.error : (reply.error.description || reply.error.message || 'API error'));
  if (reply.status && reply.status !== 'completed') throw new Error('Gemini did not finish: ' + reply.status);
  const steps = reply.steps || [];
  const output = steps.filter(s => s.type === 'model_output').pop() || steps[steps.length - 1];
  const textPart = ((output && output.content) || []).find(c => c.type === 'text');
  answer = JSON.parse(textPart ? textPart.text : reply.output_text);
} catch (e) {
  problem = e.message;
}

const seen = new Set();
const matches = ((answer && answer.matches) || [])
  .filter(m => byId.has(Number(m.candidate_id)) && !seen.has(Number(m.candidate_id)) && seen.add(Number(m.candidate_id)))
  .map(m => {
    const c = byId.get(Number(m.candidate_id));
    return {
      candidate_id: Number(c.id),
      name: c.full_name,
      cv_file: c.cv_file_name,
      score: Math.max(0, Math.min(100, Math.round(m.score))),
      reason: String(m.reason || '').trim()
    };
  })
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);

const role = roles.find(r => Number(r.id) === Number(answer && answer.role_id));

let text;
if (!answer) {
  text = `:warning: I couldn't answer "${req.question}" right now (${problem}). Please ask again in a minute.`;
} else if (!matches.length) {
  text = `:mag: *No good match* for "${req.question}".\n${answer.no_match_reason || 'Nobody in the CV database meets all the requirements.'}\nI won't suggest someone who doesn't fit.`;
} else {
  const lines = matches.map((m, i) =>
    `*${i + 1}. ${m.name}*: ${m.score}/100\n${m.reason.split('\n').map(l => '> ' + l).join('\n')}\n> :page_facing_up: ${m.cv_file}`);
  text = `:mag: *Top ${matches.length}* for "${req.question}"` +
    (role ? ` (role #${role.id}: ${role.title})` : '') + `\n\n` + lines.join('\n\n');
}

return [{
  json: {
    question: req.question,
    channel: req.channel,
    role_id: role ? Number(role.id) : 0,
    role_title: role ? role.title : '',
    matches: matches,
    candidate_ids: matches.map(m => m.candidate_id).join(','),
    shortlist_rows: role ? matches.map(m => ({ role_id: Number(role.id), candidate_id: m.candidate_id, score: m.score, reason: m.reason, source_cv: m.cv_file })) : [],
    text: text
  }
}];
