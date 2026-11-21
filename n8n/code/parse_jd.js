// Read Gemini's job description and format it for Slack and for the database.
const reply = $input.first().json;

let jd = null;
let problem = '';
try {
  if (reply.error) throw new Error(typeof reply.error === 'string' ? reply.error : (reply.error.description || reply.error.message || 'API error'));
  if (reply.status && reply.status !== 'completed') throw new Error('Gemini did not finish: ' + reply.status);
  const steps = reply.steps || [];
  const output = steps.filter(s => s.type === 'model_output').pop() || steps[steps.length - 1];
  const textPart = ((output && output.content) || []).find(c => c.type === 'text');
  jd = JSON.parse(textPart ? textPart.text : reply.output_text);
} catch (e) {
  problem = e.message;
}
// Stop loudly instead of saving a broken job description.
if (!jd) throw new Error('Could not write the job description: ' + problem);

const bullets = list => (list && list.length ? list.map(x => '• ' + x).join('\n') : '• (none stated)');

const text = [
  `*${jd.title}*: ${jd.client_company}${jd.client_location ? ' (' + jd.client_location + ')' : ''}`,
  '',
  jd.summary,
  '',
  '*Must-haves*', bullets(jd.must_haves),
  '',
  '*Nice-to-haves*', bullets(jd.nice_to_haves),
  ...(jd.not_required.length ? ['', '*Not required*', bullets(jd.not_required)] : []),
  '',
  '*What they will do*', bullets(jd.responsibilities),
  '',
  `*Salary:* ${jd.salary || 'not stated'}`,
  `*Schedule:* ${jd.schedule || 'not stated'}`,
  `*Start:* ${jd.start_date || 'not stated'}`,
  ...(jd.recruiter_notes.length ? ['', '_Recruiter notes:_', bullets(jd.recruiter_notes)] : [])
].join('\n');

return [{ json: { ...jd, job_description: text } }];
