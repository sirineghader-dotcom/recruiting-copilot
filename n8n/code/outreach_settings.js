// Settings for the outreach workflow. Change these to match your setup.
return [{
  json: {
    location_id: 'yLiKZKvk2CeI2ckIqd1L',   // the GHL sub-account (location)
    pipeline_name: 'SG - Candidates',        // the candidate pipeline in GHL
    outreach_tag: 'sg-outreach',             // adding this tag starts the GHL email sequence
    // TEST MODE: every candidate's GHL contact gets YOUR inbox with a +tag
    // (e.g. you+cand12@gmail.com), so no real person is ever emailed while testing.
    // Set to '' to email candidates at their real address.
    test_inbox: 'YOUR_EMAIL@gmail.com'
  }
}];
