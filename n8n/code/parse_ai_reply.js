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

  out.push({ json: { fileName: fileName, ...facts } });
}

return out;
