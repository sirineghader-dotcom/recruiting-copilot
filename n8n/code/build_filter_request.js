// Step 1 of the search: ask Gemini to turn the question into exact rules.
// Gemini does NOT pick candidates here; code checks the rules in the next step.
const event = $('Slack question').first().json;
const question = (event.text || '').replace(/<@[^>]+>/g, '').trim();
if (!question) throw new Error('Empty question');

const roles = $('Get roles').all().map(i => i.json).filter(r => r.id);
const roleList = roles.length
  ? roles.map(r => `[role ${r.id}] ${r.title} for ${r.client_name}. Must-haves: ${(r.must_haves || []).join('; ')}. Nice-to-haves: ${(r.nice_to_haves || []).join('; ')}`).join('\n')
  : '(no open roles)';

const instructions = `You turn a recruiter's question into search rules for a CV database. Do not answer the question.

Skill names (use exactly these when they apply): gohighlevel, zapier, n8n, make, api_webhooks, hubspot,
clickfunnels, activecampaign, meta_ads, google_ads, ga4, klaviyo, tiktok_ads, seo,
phone_support, chat_support, zendesk, freshdesk, intercom, healthcare, medical_admin, hipaa,
athenahealth, eclinicalworks, epic, insurance_verification, prior_auth,
quickbooks_online, xero, sage, bank_reconciliations, us_clients, uk_clients.

Rules:
- requirements: every hard requirement that is a skill. Each requirement is a list of acceptable options (any_of).
  "3+ years of GHL" -> [{skill: gohighlevel, min_years: 3}].
  "Zapier or n8n" -> ONE requirement with two options.
  "1+ year of phone or chat support" -> ONE requirement: phone_support 1 or chat_support 1.
  A skill with no number -> min_years 0.
- languages: languages the candidate must speak, lowercase English names (e.g. "arabic").
- other_requirements: hard requirements that are not a listed skill or a language
  (e.g. "managed $20k+/month in ad spend", "QuickBooks ProAdvisor certification").
- nice_to_haves: things that are a plus but not required.
- If the question names or clearly refers to one of the open roles, set role_id to it and include that
  role's must-haves as requirements/languages/other_requirements, and its nice-to-haves as nice_to_haves.
  Otherwise role_id is 0 and you use only what the question says.

Open roles:
${roleList}`;

const option = {
  type: 'object',
  properties: { skill: { type: 'string' }, min_years: { type: 'number' } },
  required: ['skill', 'min_years'], additionalProperties: false
};
const schema = {
  type: 'object',
  properties: {
    role_id: { type: 'integer' },
    requirements: {
      type: 'array',
      items: { type: 'object', properties: { any_of: { type: 'array', items: option } }, required: ['any_of'], additionalProperties: false }
    },
    languages: { type: 'array', items: { type: 'string' } },
    other_requirements: { type: 'array', items: { type: 'string' } },
    nice_to_haves: { type: 'array', items: { type: 'string' } }
  },
  required: ['role_id', 'requirements', 'languages', 'other_requirements', 'nice_to_haves'],
  additionalProperties: false
};

return [{
  json: {
    question: question,
    channel: event.channel,
    body: {
      model: 'gemini-3.5-flash-lite',
      system_instruction: instructions,
      input: [{ type: 'text', text: 'Question: ' + question }],
      response_format: { type: 'text', mime_type: 'application/json', schema: schema }
    }
  }
}];
