// Turn a messy call transcript into a request for Gemini to write a clean job description.
const transcript = ($input.first().json['Call transcript'] || '').trim();
if (transcript.length < 200) {
  throw new Error('The transcript is empty or too short. Paste the whole call.');
}

const instructions = `You turn a messy recruiter-client call transcript into a clean job description
for a remote-staffing agency. The recruiter will review it before anything is sent.

Rules:
- Use only facts from the transcript. Never invent requirements, salary, hours or dates. Use "" or [] when not stated.
- When the client changes their mind, use the FINAL decision, and mention the change in recruiter_notes.
- must_haves: only what the client called required. nice_to_haves: what they called a plus or bonus.
- not_required: things the client explicitly ruled out (e.g. "No payroll"), so nobody screens on them.
- Keep each list item short (under 15 words). Write in clear, friendly English.`;

const schema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    client_company: { type: 'string' },
    client_location: { type: 'string' },
    summary: { type: 'string' },
    responsibilities: { type: 'array', items: { type: 'string' } },
    must_haves: { type: 'array', items: { type: 'string' } },
    nice_to_haves: { type: 'array', items: { type: 'string' } },
    not_required: { type: 'array', items: { type: 'string' } },
    salary: { type: 'string' },
    schedule: { type: 'string' },
    start_date: { type: 'string' },
    recruiter_notes: { type: 'array', items: { type: 'string' } }
  },
  required: ['title', 'client_company', 'client_location', 'summary', 'responsibilities', 'must_haves',
             'nice_to_haves', 'not_required', 'salary', 'schedule', 'start_date', 'recruiter_notes'],
  additionalProperties: false
};

return [{
  json: {
    body: {
      model: 'gemini-3.5-flash-lite',
      system_instruction: instructions,
      input: [{ type: 'text', text: 'Call transcript:\n\n' + transcript }],
      response_format: { type: 'text', mime_type: 'application/json', schema: schema }
    }
  }
}];
