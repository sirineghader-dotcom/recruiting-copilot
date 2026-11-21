// Step 3 of the search: Gemini scores and explains ONLY the candidates code already approved.
const f = $input.first().json;

const candidateList = f.matched.map(c =>
  `[id ${c.id}] ${c.full_name} | ${c.headline} | ${c.location}\n` +
  `languages: ${(c.languages || []).join(', ')}\n` +
  `skills (years): ${c.skills}\n` +
  `CV text: ${(c.cv_text || c.summary || '').replace(/\s+/g, ' ').slice(0, 1500)}`
).join('\n\n');

const instructions = `You rank candidates for a recruiter. Every candidate below ALREADY meets these requirements
(checked by code): ${f.rules_text || '(none)'}.

Your job:
1. Remove a candidate only if their CV clearly fails one of these other requirements: ${(f.rules.other_requirements || []).join('; ') || '(none)'}.
   If the CV does not mention it, keep them and name it as the risk in line 2.
2. Score each remaining candidate from 0 to 100: 60 for meeting the requirements,
   up to 25 for experience beyond the minimum, up to 15 for these nice-to-haves: ${(f.rules.nice_to_haves || []).join('; ') || '(none)'}.
3. Return at most 5, best first. Use only ids from the list. Never invent a candidate or a number.
4. reason: exactly two short lines separated by "\\n". Line 1: why they fit, with the real numbers from the list.
   Line 2: the main gap or risk, or a bonus. Under 25 words each.
5. If every candidate fails the other requirements, return no matches and explain why in no_match_reason.`;

const schema = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: { candidate_id: { type: 'integer' }, score: { type: 'integer' }, reason: { type: 'string' } },
        required: ['candidate_id', 'score', 'reason'], additionalProperties: false
      }
    },
    no_match_reason: { type: 'string' }
  },
  required: ['matches', 'no_match_reason'],
  additionalProperties: false
};

return [{
  json: {
    body: {
      model: 'gemini-3.5-flash-lite',
      system_instruction: instructions,
      input: [{ type: 'text', text: `Recruiter question: ${f.question}\n\nCandidates (${f.matched.length}):\n\n${candidateList}` }],
      response_format: { type: 'text', mime_type: 'application/json', schema: schema }
    }
  }
}];
