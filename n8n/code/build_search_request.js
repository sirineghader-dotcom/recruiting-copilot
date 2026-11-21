// Turn a Slack question into one Gemini request containing every candidate's profile.
const event = $('Slack question').first().json;
const question = (event.text || '').replace(/<@[^>]+>/g, '').trim();
if (!question) throw new Error('Empty question');

const candidates = $('Get candidates').all().map(i => i.json).filter(c => c.id);
const roles = $('Get roles').all().map(i => i.json).filter(r => r.id);

const candidateList = candidates.map(c =>
  `[id ${c.id}] ${c.full_name} | ${c.headline} | ${c.location}\n` +
  `languages: ${(c.languages || []).join(', ')}\n` +
  `skills (years): ${c.skills}\n` +
  `CV text: ${(c.cv_text || c.summary || '').replace(/\s+/g, ' ').slice(0, 1500)}`
).join('\n\n');

const roleList = roles.length
  ? roles.map(r => `[role ${r.id}] ${r.title} for ${r.client_name}. Must-haves: ${(r.must_haves || []).join('; ')}. Nice-to-haves: ${(r.nice_to_haves || []).join('; ')}`).join('\n')
  : '(no open roles)';

const instructions = `You are a recruiting search assistant. A recruiter asks a question in plain English.
Answer ONLY from the candidate list below. Never invent a candidate, a skill, or a number.

How to answer:
1. Work out the hard requirements from the question (skills, minimum years, languages, certifications, etc.).
   If the question names one of the open roles, also use that role's must-haves as hard requirements.
   Set role_id to that role's id, or 0 if the question is not about a specific role.
2. Keep only candidates who meet EVERY hard requirement, using the "skills (years)" line and the CV text as evidence.
   "3+ years" means years >= 3. A language counts only if it is listed.
3. Score each kept candidate from 0 to 100:
   60 points for meeting all hard requirements,
   up to 25 more for experience beyond the minimum,
   up to 15 more for nice-to-haves or clearly relevant extras.
4. Return at most 5, best first. Fewer is fine. If nobody qualifies, return no matches and explain
   in no_match_reason what was missing (e.g. "Nobody has both 3+ years of GHL and Arabic. Closest: ...").
5. reason: exactly two short lines separated by "\\n". Line 1: why they fit, with the real numbers.
   Line 2: the main gap or risk, or a bonus. Under 25 words each.

Open roles:
${roleList}`;

const schema = {
  type: 'object',
  properties: {
    role_id: { type: 'integer' },
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: { candidate_id: { type: 'integer' }, score: { type: 'integer' }, reason: { type: 'string' } },
        required: ['candidate_id', 'score', 'reason'],
        additionalProperties: false
      }
    },
    no_match_reason: { type: 'string' }
  },
  required: ['role_id', 'matches', 'no_match_reason'],
  additionalProperties: false
};

return [{
  json: {
    question: question,
    channel: event.channel,
    body: {
      model: 'gemini-3.5-flash-lite',
      system_instruction: instructions,
      input: [{ type: 'text', text: `Question: ${question}\n\nCandidates (${candidates.length}):\n\n${candidateList}` }],
      response_format: { type: 'text', mime_type: 'application/json', schema: schema }
    }
  }
}];
