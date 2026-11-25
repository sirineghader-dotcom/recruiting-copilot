"""Build the importable n8n workflow files (2 and 3) from the code in n8n/code/.

Usage: python3 scripts/build_workflows.py
Workflow 1 (CV pipeline) was built by hand in n8n; export it from n8n into n8n/.
"""
import json
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
N8N = ROOT / "n8n"
SB = "https://irqnsrfhwinvujxkmsmo.supabase.co"
GEMINI = "https://generativelanguage.googleapis.com/v1beta/interactions"


def code(name):
    return (N8N / "code" / name).read_text()


def node(name, type_, ver, pos, params, **extra):
    return dict(id=str(uuid.uuid4()), name=name, type=type_, typeVersion=ver, position=pos, parameters=params, **extra)


def gemini_node(name, pos, timeout):
    return node(name, "n8n-nodes-base.httpRequest", 4.2, pos, {
        "method": "POST", "url": GEMINI,
        "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
        "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify($json.body) }}",
        "options": {"timeout": timeout}}, retryOnFail=True, maxTries=3, waitBetweenTries=5000)


def supabase(name, pos, method, url, body=None, headers=None, **extra):
    p = {"method": method, "url": url, "authentication": "predefinedCredentialType",
         "nodeCredentialType": "supabaseApi", "options": {"timeout": 30000}}
    if headers:
        p["sendHeaders"] = True
        p["headerParameters"] = {"parameters": [{"name": k, "value": v} for k, v in headers.items()]}
    if body:
        p.update(sendBody=True, specifyBody="json", jsonBody=body)
    return node(name, "n8n-nodes-base.httpRequest", 4.2, pos, p, **extra)


def slack_msg(name, pos, channel, text):
    return node(name, "n8n-nodes-base.slack", 2.3, pos,
                {"select": "channel", "channelId": channel, "text": text, "otherOptions": {}})


def slack_approval(name, pos, channel, message, yes, no):
    return node(name, "n8n-nodes-base.slack", 2.3, pos, {
        "operation": "sendAndWait", "select": "channel", "channelId": channel, "message": message,
        "approvalOptions": {"values": {"approvalType": "double", "approveLabel": yes, "disapproveLabel": no}},
        "options": {}})


def if_node(name, pos, conditions):
    return node(name, "n8n-nodes-base.if", 2.2, pos, {
        "conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                       "conditions": [dict(id=str(uuid.uuid4()), **c) for c in conditions], "combinator": "and"},
        "looseTypeValidation": True, "options": {}})


IS_APPROVED = {"leftValue": "={{ $json.data.approved }}", "rightValue": True,
               "operator": {"type": "boolean", "operation": "true", "singleValue": True}}


def save(name, nodes, edges):
    conn = {}
    for a, b, i in edges:
        outs = conn.setdefault(a, {"main": []})["main"]
        while len(outs) <= i:
            outs.append([])
        outs[i].append({"node": b, "type": "main", "index": 0})
    wf = {"name": name, "nodes": nodes, "connections": conn, "settings": {"executionOrder": "v1"}, "pinData": {}}
    path = N8N / (name.split(" - ")[0] + "_" + name.split(" - ")[1].lower().replace(" ", "_") + ".json")
    path.write_text(json.dumps(wf, indent=2, ensure_ascii=False))
    print(f"{path.name}: {len(nodes)} nodes")


# ---------- Workflow 2: transcript -> job description -> Slack approval ----------
CH = {"__rl": True, "value": "C0C8EBS0W2D", "mode": "id"}  # the #recruiting channel
JD = "$('Parse JD').first().json"
ROLE_ID = "$('Save role').first().json.id"
save("2 - Job description approval", [
    node("New role form", "n8n-nodes-base.formTrigger", 2.2, [0, 0], {
        "formTitle": "New role from a client call",
        "formDescription": "Paste the full call transcript. The AI drafts a job description and sends it to Slack for approval. Nothing is sent to the client until a recruiter approves.",
        "formFields": {"values": [{"fieldLabel": "Call transcript", "fieldType": "textarea", "requiredField": True}]},
        "options": {}}),
    node("Build JD request", "n8n-nodes-base.code", 2, [220, 0], {"jsCode": code("build_jd_request.js")}),
    gemini_node("Ask Gemini", [440, 0], 60000),
    node("Parse JD", "n8n-nodes-base.code", 2, [660, 0], {"jsCode": code("parse_jd.js")}),
    supabase("Save role", [880, 0], "POST", SB + "/rest/v1/roles",
             body="={{ JSON.stringify({ title: $json.title, client_name: $json.client_company, transcript: $('New role form').first().json['Call transcript'], job_description: $json.job_description, must_haves: $json.must_haves, nice_to_haves: $json.nice_to_haves, jd_status: 'pending_approval' }) }}",
             headers={"Prefer": "return=representation"}),
    slack_approval("Ask recruiter in Slack", [1100, 0], CH,
                   "=:memo: *New job description for approval* (role #{{ $json.id }})\n\n{{ " + JD + ".job_description }}\n\nNothing goes to the client until you approve.",
                   "Approve", "Reject"),
    if_node("Approved?", [1320, 0], [IS_APPROVED]),
    supabase("Mark approved", [1540, -100], "PATCH", "=" + SB + "/rest/v1/roles?id=eq.{{ " + ROLE_ID + " }}",
             body="={{ JSON.stringify({ jd_status: 'approved', approved_by: 'Slack approval', approved_at: new Date().toISOString() }) }}"),
    supabase("Mark rejected", [1540, 100], "PATCH", "=" + SB + "/rest/v1/roles?id=eq.{{ " + ROLE_ID + " }}",
             body="={{ JSON.stringify({ jd_status: 'rejected' }) }}"),
    slack_msg("Confirm approved", [1760, -100], CH,
              "=:white_check_mark: Approved: *{{ " + JD + ".title }}* for {{ " + JD + ".client_company }} (role #{{ " + ROLE_ID + " }}). It is now an open role and ready to share with the client."),
    slack_msg("Confirm rejected", [1760, 100], CH,
              "=:x: Rejected: *{{ " + JD + ".title }}* (role #{{ " + ROLE_ID + " }}). Nothing was sent. Submit the transcript again to get a new draft."),
], [("New role form", "Build JD request", 0), ("Build JD request", "Ask Gemini", 0), ("Ask Gemini", "Parse JD", 0),
    ("Parse JD", "Save role", 0), ("Save role", "Ask recruiter in Slack", 0), ("Ask recruiter in Slack", "Approved?", 0),
    ("Approved?", "Mark approved", 0), ("Approved?", "Mark rejected", 1),
    ("Mark approved", "Confirm approved", 0), ("Mark rejected", "Confirm rejected", 0)])

# ---------- Workflow 3: Slack search bot ----------
# Gemini turns the question into rules -> code checks EVERY candidate -> Gemini only scores the ones that passed.
P = "$('Parse matches').first().json"
CH3 = {"__rl": True, "value": "={{ " + P + ".channel }}", "mode": "id"}
gem_rules = gemini_node("Ask Gemini (rules)", [880, 0], 60000)
gem_rank = gemini_node("Ask Gemini (rank)", [1540, -100], 90000)
for g in (gem_rules, gem_rank):
    g["onError"] = "continueRegularOutput"
LOG = supabase("Log answer", [2420, 200], "POST", SB + "/rest/v1/bot_answers",
               body="={{ JSON.stringify({ question: $('Build filter request').first().json.question, answer_text: " + P + ".text, "
                    "candidate_names: " + P + ".matches.map(m => m.name), role_id: " + P + ".role_id || null }) }}")
LOG["onError"] = "continueRegularOutput"   # logging must never break the bot
save("3 - Slack search bot", [
    node("Slack question", "n8n-nodes-base.slackTrigger", 1, [0, 0], {"trigger": ["app_mention"], "watchWorkspace": True, "options": {}}),
    supabase("Get roles", [220, 0], "GET", SB + "/rest/v1/roles?select=id,title,client_name,must_haves,nice_to_haves&jd_status=eq.approved",
             alwaysOutputData=True),
    supabase("Get candidates", [440, 0], "GET", SB + "/rest/v1/candidate_profiles?select=*&order=id",
             alwaysOutputData=True, executeOnce=True),
    node("Build filter request", "n8n-nodes-base.code", 2, [660, 0], {"jsCode": code("build_filter_request.js")}),
    gem_rules,
    node("Apply filters", "n8n-nodes-base.code", 2, [1100, 0], {"jsCode": code("apply_filters.js")}),
    if_node("Anyone qualifies?", [1320, 0], [
        {"leftValue": "={{ $json.matched_count }}", "rightValue": 0, "operator": {"type": "number", "operation": "gt"}}]),
    node("Build rank request", "n8n-nodes-base.code", 2, [1540, -200], {"jsCode": code("build_rank_request.js")}),
    gem_rank,
    node("Parse matches", "n8n-nodes-base.code", 2, [1980, 0], {"jsCode": code("parse_matches.js")}),
    slack_msg("Reply in Slack", [2200, 0], CH3, "={{ " + P + ".text }}"),
    LOG,
    if_node("For a role?", [2420, 0], [
        {"leftValue": "={{ " + P + ".role_id }}", "rightValue": 0, "operator": {"type": "number", "operation": "gt"}},
        {"leftValue": "={{ " + P + ".matches.length }}", "rightValue": 0, "operator": {"type": "number", "operation": "gt"}}]),
    supabase("Save shortlist", [2640, -100], "POST", SB + "/rest/v1/shortlists?on_conflict=role_id,candidate_id",
             body="={{ JSON.stringify(" + P + ".shortlist_rows) }}",
             headers={"Prefer": "resolution=merge-duplicates"}, executeOnce=True),
    slack_approval("Ask to approve outreach", [2860, -100], CH3,
                   "=:envelope: *Approve outreach?*\nRole #{{ " + P + ".role_id }}: {{ " + P + ".role_title }}\nCandidates: {{ " + P + ".matches.map(m => m.name).join(', ') }}\n\nIf you approve, they go into the GHL candidate pipeline and receive the email sequence. Nothing is sent before you approve.",
                   "Approve outreach", "Don't contact"),
    if_node("Approved?", [3080, -100], [IS_APPROVED]),
    supabase("Mark shortlist approved", [3300, -200], "PATCH",
             "=" + SB + "/rest/v1/shortlists?role_id=eq.{{ " + P + ".role_id }}&candidate_id=in.({{ " + P + ".candidate_ids }})",
             body="={{ JSON.stringify({ stage: 'approved', updated_at: new Date().toISOString() }) }}"),
    slack_msg("Confirm approved", [3520, -200], CH3,
              "=:white_check_mark: Outreach approved for {{ " + P + ".matches.length }} candidates (role #{{ " + P + ".role_id }}). They are now in the Approved stage."),
    slack_msg("Confirm not approved", [3300, 0], CH3,
              "=:no_entry_sign: Outreach not approved for role #{{ " + P + ".role_id }}. Nobody was contacted. The candidates stay in the Shortlisted stage."),
], [("Slack question", "Get roles", 0), ("Get roles", "Get candidates", 0), ("Get candidates", "Build filter request", 0),
    ("Build filter request", "Ask Gemini (rules)", 0), ("Ask Gemini (rules)", "Apply filters", 0), ("Apply filters", "Anyone qualifies?", 0),
    ("Anyone qualifies?", "Build rank request", 0), ("Anyone qualifies?", "Parse matches", 1),
    ("Build rank request", "Ask Gemini (rank)", 0), ("Ask Gemini (rank)", "Parse matches", 0),
    ("Parse matches", "Reply in Slack", 0), ("Reply in Slack", "For a role?", 0), ("Reply in Slack", "Log answer", 0), ("For a role?", "Save shortlist", 0),
    ("Save shortlist", "Ask to approve outreach", 0), ("Ask to approve outreach", "Approved?", 0),
    ("Approved?", "Mark shortlist approved", 0), ("Approved?", "Confirm not approved", 1),
    ("Mark shortlist approved", "Confirm approved", 0)])

# ---------- Workflow 4: GHL outreach + pipeline sync ----------
# Every minute: hand newly approved candidates to the GHL workflow "SG - Candidate intake" (inbound
# webhook; it creates the contact + opportunity and adds the tag that starts the email sequence),
# then copy GHL pipeline stages back to Supabase for the portal. The course key is read-only,
# so n8n only READS from the GHL API.
GHL = "https://services.leadconnectorhq.com"
F = "$('Prepare GHL records').item.json"


def ghl(name, pos, method, url, body=None, **extra):
    p = {"method": method, "url": url, "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
         "sendHeaders": True, "headerParameters": {"parameters": [{"name": "Version", "value": "2021-07-28"}]},
         "options": {"timeout": 30000}}
    if body:
        p.update(sendBody=True, specifyBody="json", jsonBody=body)
    return node(name, "n8n-nodes-base.httpRequest", 4.2, pos, p, **extra)


send = node("Send to GHL", "n8n-nodes-base.httpRequest", 4.2, [1320, -100], {
    "method": "POST", "url": "={{ $('Settings').first().json.ghl_webhook }}",
    "sendBody": True, "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify((({ shortlist_id, ...rest }) => rest)($json)) }}",
    "options": {"timeout": 30000}})
save("4 - GHL outreach", [
    node("Every minute", "n8n-nodes-base.scheduleTrigger", 1.2, [0, 0],
         {"rule": {"interval": [{"field": "minutes", "minutesInterval": 1}]}}),
    node("Settings", "n8n-nodes-base.code", 2, [220, 0], {"jsCode": code("outreach_settings.js")}),
    ghl("Get GHL pipelines", [440, 0], "GET", "=" + GHL + "/opportunities/pipelines?locationId={{ $json.location_id }}"),
    node("Find pipeline", "n8n-nodes-base.code", 2, [660, 0], {"jsCode": code("find_pipeline.js")}),
    # --- push: approved -> GHL ---
    supabase("Get approved shortlist", [880, -100], "GET",
             SB + "/rest/v1/shortlists?select=id,role_id,candidate_id,candidates(full_name,email),roles(title)&stage=eq.approved",
             alwaysOutputData=True),
    node("Prepare GHL records", "n8n-nodes-base.code", 2, [1100, -100], {"jsCode": code("prepare_ghl_records.js")}),
    send,
    supabase("Mark contacted", [1540, -100], "PATCH", "=" + SB + "/rest/v1/shortlists?id=eq.{{ " + F + ".shortlist_id }}",
             body="={{ JSON.stringify({ stage: 'contacted', updated_at: new Date().toISOString() }) }}"),
    node("Summarize", "n8n-nodes-base.code", 2, [1760, -100], {"jsCode": code("summarize_outreach.js")}),
    slack_msg("Tell recruiter", [1980, -100], CH, "={{ $json.text }}"),
    # --- pull: GHL stages -> Supabase ---
    ghl("Get SG opportunities", [880, 150], "GET",
        "=" + GHL + "/opportunities/search?location_id={{ $('Settings').first().json.location_id }}&pipeline_id={{ $json.pipeline_id }}&limit=100"),
    supabase("Get current stages", [1100, 150], "GET", SB + "/rest/v1/shortlists?select=role_id,candidate_id,stage",
             alwaysOutputData=True, executeOnce=True),
    node("Find stage changes", "n8n-nodes-base.code", 2, [1320, 150], {"jsCode": code("find_stage_changes.js")}),
    supabase("Update stage", [1540, 150], "PATCH",
             "=" + SB + "/rest/v1/shortlists?role_id=eq.{{ $json.role_id }}&candidate_id=eq.{{ $json.candidate_id }}",
             body="={{ JSON.stringify({ stage: $json.stage, updated_at: new Date().toISOString() }) }}"),
], [("Every minute", "Settings", 0), ("Settings", "Get GHL pipelines", 0), ("Get GHL pipelines", "Find pipeline", 0),
    ("Find pipeline", "Get approved shortlist", 0), ("Get approved shortlist", "Prepare GHL records", 0),
    ("Prepare GHL records", "Send to GHL", 0), ("Send to GHL", "Mark contacted", 0),
    ("Mark contacted", "Summarize", 0), ("Summarize", "Tell recruiter", 0),
    ("Find pipeline", "Get SG opportunities", 0), ("Get SG opportunities", "Get current stages", 0),
    ("Get current stages", "Find stage changes", 0), ("Find stage changes", "Update stage", 0)])


# The one node to paste into the existing workflow 3 (so the Slack URL stays the same).
(N8N / "3_add_log_answer_node.json").write_text(json.dumps({"nodes": [LOG], "connections": {}}, indent=2, ensure_ascii=False))
print("3_add_log_answer_node.json: 1 node")

# ---------- Workflow 5: portal data ----------
# The portal (browser) calls this webhook; n8n reads Supabase with its secret key. No key in browser code.
save("5 - Portal data", [
    node("Portal asks for data", "n8n-nodes-base.webhook", 2, [0, 0],
         {"httpMethod": "GET", "path": "sg-portal-data", "responseMode": "responseNode",
          "options": {"allowedOrigins": "*"}}, webhookId=str(uuid.uuid4())),
    supabase("Get portal data", [220, 0], "POST", SB + "/rest/v1/rpc/portal_data", body="={{ JSON.stringify({}) }}"),
    node("Send to portal", "n8n-nodes-base.respondToWebhook", 1.1, [440, 0],
         {"respondWith": "json", "responseBody": "={{ JSON.stringify($json) }}",
          "options": {"responseHeaders": {"entries": [
              {"name": "Access-Control-Allow-Origin", "value": "*"},
              {"name": "Cache-Control", "value": "no-store"}]}}}),
], [("Portal asks for data", "Get portal data", 0), ("Get portal data", "Send to portal", 0)])
