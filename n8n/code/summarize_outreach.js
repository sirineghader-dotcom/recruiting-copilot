// One Slack message for the whole batch instead of one per candidate.
const done = $('Prepare GHL records').all().map(i => i.json);
const byRole = {};
for (const d of done) (byRole[d.role_id] = byRole[d.role_id] || { title: d.role_title, names: [] }).names.push(d.name);

const lines = Object.entries(byRole).map(([id, r]) => `• Role #${id} (${r.title}): ${r.names.join(', ')}`);
return [{
  json: {
    text: `:incoming_envelope: *Outreach started* for ${done.length} candidate${done.length === 1 ? '' : 's'}\n` +
      lines.join('\n') +
      `\nThey are in the GHL pipeline (Outreach Sent) and the email sequence has begun. It stops automatically when they reply.`
  }
}];
