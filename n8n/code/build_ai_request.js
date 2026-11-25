// Build one Gemini request per CV.
// Word files arrive with their text already extracted; PDFs arrive as files,
// which Gemini reads directly (it reads page images, so scanned PDFs work too).
const today = new Date().toISOString().slice(0, 7); // e.g. "2026-10"

const instructions = `You extract facts from one CV for a recruiting database. Today is ${today}.

Rules:
- Only use what the CV says. Never invent. Use "" for unknown text and [] for unknown lists.
- readable: false if the document is blank, not a CV, or too damaged to read. Explain why in unreadable_reason.
- email: lowercase. languages: lowercase English names, e.g. "arabic".
- jobs: every dated job, oldest or newest first. start and end as YYYY-MM (only a year given: YYYY-01 for start,
  YYYY-12 for end; current job: end "present"). skills = the skill names used IN THAT JOB, judged only from
  that job's own title and description: the tools it names, the kind of work it is, and hipaa where it applied.
  Never give a job a tool its own text does not mention, even if the tool appears elsewhere in the CV.
- The kind of work is a skill too. A job in a medical office, clinic, telehealth or healthcare practice doing admin
  work (scheduling, patient records, intake, billing, insurance, medical VA) is medical_admin. A customer-facing
  phone or chat job is phone_support or chat_support.
- Certificates and trainings are skills: any HIPAA training/certificate/compliance means a hipaa entry.
- skills: every skill in the CV (from jobs, skills lists and certificates), with your best estimate of years.
  (The years are recomputed exactly from the jobs afterwards; a skill in no dated job gets 0.)
- Use these skill names when they apply: gohighlevel, zapier, n8n, make, api_webhooks, hubspot,
  clickfunnels, activecampaign, meta_ads, google_ads, ga4, klaviyo, tiktok_ads, seo,
  phone_support, chat_support, zendesk, freshdesk, intercom, healthcare, medical_admin, hipaa,
  athenahealth, eclinicalworks, epic, insurance_verification, prior_auth,
  quickbooks_online, xero, sage, bank_reconciliations, us_clients, uk_clients.
  Other skills: short lowercase snake_case names.
- cv_updated: the CV's own "last updated" date as YYYY-MM, or "" if it has none.
- cv_text: the full CV as plain text, so it can be searched.`;

const schema = {
  type: 'object',
  properties: {
    readable: { type: 'boolean' },
    unreadable_reason: { type: 'string' },
    full_name: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    location: { type: 'string' },
    headline: { type: 'string' },
    summary: { type: 'string' },
    cv_updated: { type: 'string' },
    languages: { type: 'array', items: { type: 'string' } },
    jobs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' },
          skills: { type: 'array', items: { type: 'string' } }
        },
        required: ['title', 'start', 'end', 'skills'],
        additionalProperties: false
      }
    },
    skills: {
      type: 'array',
      items: {
        type: 'object',
        properties: { skill: { type: 'string' }, years: { type: 'number' } },
        required: ['skill', 'years'],
        additionalProperties: false
      }
    },
    cv_text: { type: 'string' }
  },
  required: ['readable', 'unreadable_reason', 'full_name', 'email', 'phone', 'location',
             'headline', 'summary', 'cv_updated', 'languages', 'jobs', 'skills', 'cv_text'],
  additionalProperties: false
};

const out = [];
const items = $input.all();

for (let i = 0; i < items.length; i++) {
  const item = items[i];
  let cvPart;

  if (item.json.ext === 'docx') {
    cvPart = { type: 'text', text: 'CV file: ' + item.json.fileName + '\n\n' + (item.json.text || '(empty document)') };
  } else {
    const pdf = await this.helpers.getBinaryDataBuffer(i, 'file');
    cvPart = { type: 'document', mime_type: 'application/pdf', data: pdf.toString('base64') };
  }

  out.push({
    json: {
      fileName: item.json.fileName,
      body: {
        model: 'gemini-3.5-flash-lite',
        system_instruction: instructions,
        input: [cvPart, { type: 'text', text: 'Extract the facts from this CV.' }],
        response_format: { type: 'text', mime_type: 'application/json', schema: schema }
      }
    }
  });
}

return out;
