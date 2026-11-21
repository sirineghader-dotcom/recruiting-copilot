// Turn each newly approved shortlist row into one request for the GHL intake workflow.
const s = $('Settings').first().json;
const info = $('Find pipeline').first().json;
const rows = $input.all().map(i => i.json).filter(r => r.id);   // empty result -> nothing to do
if (!rows.length) return [];
// Safety: never send anything until a real test inbox is filled in.
if (/YOUR_EMAIL/i.test(s.test_inbox)) throw new Error('Open the Settings node and put your own email in test_inbox first.');
if (!/^https:\/\//.test(s.ghl_webhook)) throw new Error('Open the Settings node and paste the GHL webhook URL into ghl_webhook first.');

const testEmail = candidateId => {
  const [user, domain] = s.test_inbox.split('@');
  return `${user}+cand${candidateId}@${domain}`;
};

return rows.map(r => {
  const c = r.candidates || {};
  const fullName = c.full_name || 'Candidate';
  const [first, ...rest] = fullName.split(' ');
  return {
    json: {
      shortlist_id: r.id,
      role_id: r.role_id,
      role_title: (r.roles || {}).title || '',
      candidate_id: r.candidate_id,
      name: fullName,
      // Flat fields: these are what you map in the GHL workflow ({{inboundWebhookRequest.email}} etc.)
      first_name: first,
      last_name: rest.join(' '),
      full_name: fullName,
      email: s.test_inbox ? testEmail(r.candidate_id) : c.email,
      // The role and candidate ids in the name let us sync stages back to Supabase later.
      opportunity_name: `SG - ${fullName} (role ${r.role_id}, candidate ${r.candidate_id})`,
      source: 'SG Recruiting Copilot'
    }
  };
});
