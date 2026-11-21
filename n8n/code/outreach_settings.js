// Settings for the outreach workflow. Change these to match your setup.
return [{
  json: {
    location_id: 'yLiKZKvk2CeI2ckIqd1L',   // the GHL sub-account (location)
    pipeline_name: 'SG - Candidates',        // the candidate pipeline in GHL
    // The URL of the "Inbound Webhook" trigger of the GHL workflow "SG - Candidate intake".
    // The course key can only READ from GHL, so n8n hands each candidate to that GHL workflow,
    // which creates the contact + opportunity and adds the tag that starts the email sequence.
    // Paste it in n8n only, never in GitHub (anyone with it could create contacts).
    ghl_webhook: 'PASTE_GHL_WEBHOOK_URL',
    // TEST MODE: every candidate's GHL contact gets YOUR inbox with a +tag
    // (e.g. you+cand12@gmail.com), so no real person is ever emailed while testing.
    // Set to '' to email candidates at their real address.
    test_inbox: 'YOUR_EMAIL@gmail.com'
  }
}];
