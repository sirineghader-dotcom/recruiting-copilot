// Turn Gemini's reply into one clean candidate record.
// If anything went wrong, the CV is marked unreadable so it gets flagged, never skipped.
const out = [];
const items = $input.all();

for (let i = 0; i < items.length; i++) {
  const reply = items[i].json;
  const fileName = $('Build AI request').itemMatching(i).json.fileName;

  let facts = null;
  let problem = '';
  try {
    if (reply.error) throw new Error(typeof reply.error === 'string' ? reply.error : (reply.error.description || reply.error.message || 'API error'));
    if (reply.status && reply.status !== 'completed') throw new Error('Gemini did not finish: ' + reply.status);
    // The answer is the text inside the last "model_output" step.
    const steps = reply.steps || [];
    const output = steps.filter(s => s.type === 'model_output').pop() || steps[steps.length - 1];
    const textPart = ((output && output.content) || []).find(c => c.type === 'text');
    facts = JSON.parse(textPart ? textPart.text : reply.output_text);
  } catch (e) {
    problem = e.message;
  }

  if (!facts) {
    facts = { readable: false, unreadable_reason: 'Could not process: ' + problem };
  }
  if (facts.readable && !facts.email) {
    facts.readable = false;
    facts.unreadable_reason = 'No email address found, so the candidate cannot be identified';
  }

  if (facts.readable) facts.skills = yearsFromJobs(facts);
  delete facts.jobs;
  out.push({ json: { fileName: fileName, ...facts } });
}

return out;


// Years are counted by code, not by the AI: for each skill, add up the months of the jobs that used it
// (overlapping jobs count once). A skill that is in no dated job keeps the AI's estimate.
function yearsFromJobs(facts) {
  const month = v => { const m = /^(\d{4})-(\d{2})/.exec(String(v || '')); return m ? +m[1] * 12 + (+m[2] - 1) : null; };
  const now = new Date();
  const thisMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const spans = {};
  for (const job of facts.jobs || []) {
    const start = month(job.start);
    const end = /present|current|now/i.test(job.end || '') ? thisMonth : month(job.end);
    if (start === null || end === null || end < start) continue;
    for (const raw of job.skills || []) {
      const skill = String(raw).toLowerCase().trim();
      if (skill) (spans[skill] = spans[skill] || []).push([start, end + 1]);   // end month counts
    }
  }
  const years = {};
  for (const [skill, list] of Object.entries(spans)) {
    list.sort((a, b) => a[0] - b[0]);
    let total = 0, s = list[0][0], e = list[0][1];
    for (const [a, b] of list.slice(1)) {
      if (a <= e) e = Math.max(e, b); else { total += e - s; s = a; e = b; }
    }
    total += e - s;
    years[skill] = Math.round(total / 12 * 10) / 10;
  }
  const result = new Map(Object.entries(years));
  for (const x of facts.skills || []) {
    const skill = String(x.skill || '').toLowerCase().trim();
    if (skill && !result.has(skill)) result.set(skill, Number(x.years) || 0);
  }
  return [...result].map(([skill, y]) => ({ skill, years: y }));
}
