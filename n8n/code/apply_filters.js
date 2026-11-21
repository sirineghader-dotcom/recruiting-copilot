// Step 2 of the search: check EVERY candidate against the rules, in plain code.
// Code never overlooks anyone, so the shortlist can't miss a qualified person.
const req = $('Build filter request').first().json;
const reply = $input.first().json;

function geminiJson(r) {
  if (r.error) throw new Error(typeof r.error === 'string' ? r.error : (r.error.description || r.error.message || 'API error'));
  if (r.status && r.status !== 'completed') throw new Error('Gemini did not finish: ' + r.status);
  const steps = r.steps || [];
  const output = steps.filter(s => s.type === 'model_output').pop() || steps[steps.length - 1];
  const textPart = ((output && output.content) || []).find(c => c.type === 'text');
  return JSON.parse(textPart ? textPart.text : r.output_text);
}

let rules = null;
let problem = '';
try { rules = geminiJson(reply); } catch (e) { problem = e.message; }

// "gohighlevel 3.7y, make 3.7y" -> { gohighlevel: 3.7, make: 3.7 }
const parseSkills = text => Object.fromEntries((text || '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
  const m = s.match(/^(.*)\s([\d.]+)y$/);
  return m ? [m[1].trim().toLowerCase(), parseFloat(m[2])] : [s.toLowerCase(), 0];
}));

const describe = r => r.any_of.map(o => o.min_years > 0 ? `${o.skill} ${o.min_years}+ yrs` : o.skill).join(' or ');

const candidates = $('Get candidates').all().map(i => i.json).filter(c => c.id);
const matched = [];
const nearMisses = [];

if (rules) {
  const requirements = (rules.requirements || []).filter(r => (r.any_of || []).length);
  const languages = (rules.languages || []).map(l => l.toLowerCase().trim()).filter(Boolean);

  for (const c of candidates) {
    const skills = parseSkills(c.skills);
    const langs = (c.languages || []).map(l => String(l).toLowerCase());
    const missing = [];

    for (const r of requirements) {
      const ok = r.any_of.some(o => (skills[String(o.skill).toLowerCase()] ?? -1) >= (o.min_years || 0));
      if (!ok) {
        const has = r.any_of.map(o => skills[String(o.skill).toLowerCase()]).filter(v => v !== undefined);
        missing.push(describe(r) + (has.length ? ` (has ${Math.max(...has)} yrs)` : ''));
      }
    }
    for (const l of languages) if (!langs.includes(l)) missing.push('speaks ' + l);

    // How much experience beyond the minimum, used to keep the best when there are many.
    const extra = requirements.reduce((sum, r) => sum + Math.max(0, ...r.any_of.map(o => (skills[String(o.skill).toLowerCase()] ?? 0) - (o.min_years || 0))), 0);

    if (!missing.length) matched.push({ ...c, extra });
    else if (missing.length === 1) nearMisses.push({ name: c.full_name, cv_file: c.cv_file_name, missing: missing[0] });
  }
  matched.sort((a, b) => b.extra - a.extra);
}

return [{
  json: {
    question: req.question,
    channel: req.channel,
    problem: problem,
    rules: rules,
    rules_text: rules ? [...(rules.requirements || []).map(describe), ...(rules.languages || []).map(l => 'speaks ' + l), ...(rules.other_requirements || [])].join(', ') : '',
    matched: matched.slice(0, 25),
    matched_count: matched.length,
    near_misses: nearMisses.slice(0, 3)
  }
}];
