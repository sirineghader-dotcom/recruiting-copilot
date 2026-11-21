// Turn each newly approved shortlist row into a GHL contact + opportunity.
const s = $('Settings').first().json;
const info = $('Find pipeline').first().json;
const rows = $input.all().map(i => i.json).filter(r => r.id);   // empty result -> nothing to do
if (!rows.length) return [];
// Safety: never send anything until a real test inbox is filled in.
if (/YOUR_EMAIL/i.test(s.test_inbox)) throw new Error('Open the Settings node and put your own email in test_inbox first.');

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
      contact: {
        locationId: s.location_id,
        firstName: first,
        lastName: rest.join(' '),
        name: fullName,
        email: s.test_inbox ? testEmail(r.candidate_id) : c.email,
        tags: ['sg-candidate', 'sg-role-' + r.role_id],
        source: 'SG Recruiting Copilot'
      },
      opportunity: {
        pipelineId: info.pipeline_id,
        locationId: s.location_id,
        pipelineStageId: info.stages.outreachsent,
        status: 'open',
        // The role and candidate ids in the name let us sync stages back to Supabase later.
        name: `SG - ${fullName} (role ${r.role_id}, candidate ${r.candidate_id})`
      }
    }
  };
});
