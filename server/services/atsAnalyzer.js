// server/services/atsAnalyzer.js
// UPGRADE 2 — Ruthlessly realistic, multi-metric ATS scoring
// Hybrid: local heuristic (instant, no API cost) + optional AI deep-scan layer
// Returns structured JSON that maps directly to the 4 Checklist categories:
//   content | format | skills | style

'use strict';

const axios = require('axios');

// ─── Lookup Tables ──────────────────────────────────────────────────────────

const TECH_SKILLS = [
  'javascript','python','java','c++','c#','typescript','go','rust','kotlin','swift',
  'php','ruby','r','scala','dart','bash','perl',
  'react','angular','vue','nextjs','next.js','html','css','sass','tailwind','redux',
  'webpack','svelte','bootstrap','jquery',
  'node.js','nodejs','express','django','flask','fastapi','spring','springboot',
  'laravel','graphql','rest','restful','microservices','asp.net',
  'mongodb','mysql','postgresql','redis','sqlite','oracle','cassandra','dynamodb',
  'firebase','elasticsearch',
  'aws','azure','gcp','docker','kubernetes','terraform','jenkins','linux','nginx',
  'ci/cd','github actions','ansible','devops',
  'machine learning','deep learning','tensorflow','pytorch','keras','scikit-learn',
  'pandas','numpy','opencv','nlp','data science','data analysis','sql','tableau',
  'power bi','spark','hadoop','llm','langchain',
  'react native','flutter','android','ios',
  'git','github','gitlab','jira','figma','postman',
  'agile','scrum','kanban',
];

const SECTIONS = {
  contact:      ['email','phone','mobile','linkedin','github','portfolio'],
  summary:      ['summary','objective','profile','about me','career objective'],
  experience:   ['experience','work history','employment','internship','worked at'],
  education:    ['education','degree','university','college','bachelor','master','b.tech','m.tech','b.e','gpa','cgpa'],
  skills:       ['skills','technical skills','technologies','tools','expertise'],
  projects:     ['projects','personal projects','academic projects','portfolio'],
  achievements: ['achievements','awards','certifications','certificates'],
};

const STRONG_ACTION_VERBS = [
  'developed','built','designed','implemented','created','managed','led','architected',
  'optimized','improved','increased','reduced','deployed','integrated','automated',
  'engineered','launched','delivered','collaborated','analyzed','spearheaded',
  'streamlined','orchestrated','mentored','refactored',
];

const WEAK_VERBS = ['responsible for','worked on','helped with','assisted in','participated in'];

const BUZZWORDS = [
  'synergy','guru','ninja','rockstar','passionate','hardworking','team player',
  'go-getter','dynamic','results-oriented','detail-oriented','self-starter',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

// ─── Local Scoring Sub-Engines ──────────────────────────────────────────────

/**
 * CONTENT scoring (max 30 pts)
 * Criteria: sections completeness, action verbs, quantification, word repetition
 * STRICT: most resumes should score 12-20 here, not 25+
 */
function scoreContent(text, rawText) {
  let pts = 0;
  const checks = {};

  // 1. Section coverage (up to 10 pts — critical sections must ALL be present for full marks)
  const criticalSections = ['contact','summary','experience','education','skills'];
  const sectionResults = {};
  for (const [name, kws] of Object.entries(SECTIONS)) {
    sectionResults[name] = kws.some(k => text.includes(k));
  }
  const foundSections = Object.entries(sectionResults).filter(([,v]) => v).map(([k]) => k);
  const missingSections = Object.entries(sectionResults).filter(([,v]) => !v).map(([k]) => k);
  const criticalFound = criticalSections.filter(s => sectionResults[s]).length;
  // Strict: need all 5 critical sections for full marks, partial credit is harsh
  if (criticalFound === 5) pts += 10;
  else if (criticalFound === 4) pts += 7;
  else if (criticalFound === 3) pts += 4;
  else pts += Math.max(0, criticalFound * 1.5);
  checks.sectionsFound = foundSections;
  checks.sectionsMissing = missingSections;

  // Bonus for optional sections (projects, achievements) — up to 3 pts
  const bonusSections = ['projects','achievements'];
  const bonusFound = bonusSections.filter(s => sectionResults[s]).length;
  pts += bonusFound * 1.5;

  // 2. Quantified impact (up to 8 pts) — STRICT: need 5+ metrics for full marks
  const qPattern = /(\d+%|\d+\s*x\b|\$\d+|₹\d+|\d+\s*(users|clients|customers|projects|teams|members|hours|days|months|lakh|crore|k\b|ms\b|seconds?))/gi;
  const qExamples = (rawText.match(qPattern) || []).slice(0, 8);
  const qScore = qExamples.length >= 5 ? 8 : qExamples.length >= 3 ? 5 : qExamples.length >= 1 ? 2 : 0;
  pts += qScore;
  checks.quantifiedExamples = qExamples.slice(0, 5);
  checks.hasQuantifiedImpact = qExamples.length >= 5;

  // 3. Action verbs (up to 5 pts) — need 8+ unique strong verbs for full marks
  const verbsFound = STRONG_ACTION_VERBS.filter(v => text.includes(v));
  if (verbsFound.length >= 8) pts += 5;
  else if (verbsFound.length >= 5) pts += 3;
  else if (verbsFound.length >= 2) pts += 1.5;
  else pts += 0;
  checks.actionVerbsFound = verbsFound.length;

  // 4. Word repetition penalty (up to -4 pts)
  const words = text.split(/\s+/).filter(w => w.length > 5);
  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  const overused = Object.entries(freq).filter(([,c]) => c > 4).map(([w]) => w);
  if (overused.length > 2) pts -= 2;
  if (overused.length > 5) pts -= 2;
  checks.overusedWords = overused.slice(0, 5);

  // 5. Weak verb penalty — stricter
  const weakFound = WEAK_VERBS.filter(v => text.includes(v));
  if (weakFound.length >= 1) pts -= weakFound.length * 1.5;
  checks.weakVerbsFound = weakFound;

  return { pts: Math.max(0, Math.min(30, pts)), max: 30, checks };
}

/**
 * FORMAT scoring (max 25 pts)
 * Criteria: file info, length, email, phone, special chars, structure
 * STRICT: starts at 0 and earns points (not starts at 25 and deducts)
 */
function scoreFormat(rawText) {
  let pts = 0;
  const issues = [];
  const checks = {};

  const wc = wordCount(rawText);
  checks.wordCount = wc;

  // Length check (optimal: 300–800 words for 1-2 pages) — up to 6 pts
  if (wc >= 300 && wc <= 800) { pts += 6; }
  else if (wc >= 250 && wc <= 1000) { pts += 4; }
  else if (wc >= 200 && wc <= 1200) { pts += 2; }
  else { pts += 0; }

  if (wc < 200) issues.push('Resume is too short — aim for at least 300 words (1 full page)');
  else if (wc < 300) issues.push('Resume is slightly short — add more detail to experience/projects');
  else if (wc > 1000) issues.push('Resume may exceed 2 pages — trim to keep under ~800 words');
  checks.lengthOk = wc >= 300 && wc <= 800;

  // Contact info — up to 8 pts
  const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(rawText);
  const hasPhone = /(\+91|91)?[\s-]?[6-9]\d{9}/.test(rawText) ||
                   /(\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(rawText);
  const hasLinkedIn = /linkedin\.com\//i.test(rawText);
  const hasGitHub = /github\.com\//i.test(rawText);

  if (hasEmail) pts += 3; else issues.push('No email address detected — add it in the header');
  if (hasPhone) pts += 3; else issues.push('No phone number found — include it for recruiter contact');
  if (hasLinkedIn) pts += 1; else issues.push('LinkedIn URL missing — adds credibility');
  if (hasGitHub) pts += 1;
  checks.hasEmail = hasEmail;
  checks.hasPhone = hasPhone;
  checks.hasLinkedIn = hasLinkedIn;

  // Special characters (ATS misreads) — up to 4 pts (earn by NOT having them)
  const specialChars = (rawText.match(/[│┤├─┼|▪▸►◆◇★☆✓✗●○■□▶◀]/g) || []).length;
  if (specialChars <= 2) pts += 4;
  else if (specialChars <= 5) pts += 2;
  else if (specialChars <= 15) { pts += 0; issues.push('A few special characters detected — prefer plain hyphens/dashes'); }
  else { pts -= 2; issues.push('Too many special/box-drawing characters — ATS may garble your content'); }
  checks.specialCharCount = specialChars;
  checks.specialCharsOk = specialChars <= 5;

  // Bullet point consistency — up to 4 pts
  const bulletLines = (rawText.match(/^[•\-\*]\s/gm) || []).length;
  checks.bulletPointCount = bulletLines;
  if (bulletLines >= 8) pts += 4;
  else if (bulletLines >= 5) pts += 3;
  else if (bulletLines >= 3) pts += 1;
  else if (wc > 300) {
    issues.push('Few or no bullet points — structure experience with bullets for ATS clarity');
  }

  // Clear section headers (look for uppercase or bold-pattern headers) — up to 3 pts
  const headerPatterns = (rawText.match(/^[A-Z][A-Z\s]{3,}$/gm) || []).length;
  if (headerPatterns >= 4) pts += 3;
  else if (headerPatterns >= 2) pts += 1.5;
  
  return { pts: Math.max(0, Math.min(25, pts)), max: 25, issues, checks };
}

/**
 * SKILLS scoring (max 25 pts)
 * Criteria: hard skills breadth, soft skills, JD match, certifications
 * STRICT: need 10+ relevant skills for full marks, not just 6
 */
function scoreSkills(text, rawText, jobDescription = '') {
  const found = TECH_SKILLS.filter(s => {
    try {
      return new RegExp(`\\b${escapeRegex(s)}\\b`, 'i').test(text);
    } catch {
      return text.includes(s.toLowerCase());
    }
  });

  // Tiered scoring — need substantial skills for good score
  let pts = 0;
  if (found.length >= 15) pts = 16;
  else if (found.length >= 12) pts = 13;
  else if (found.length >= 9) pts = 10;
  else if (found.length >= 6) pts = 7;
  else if (found.length >= 4) pts = 4;
  else if (found.length >= 2) pts = 2;
  else pts = 0;

  // Boost for certifications (up to 3 pts)
  const hasCerts = /certif(ied|ication)|aws certified|google cloud certified|microsoft certified|pmp|cfa|cpa|comptia/i.test(text);
  if (hasCerts) pts += 3;

  // Skill diversity bonus — having skills across multiple categories (up to 3 pts)
  const categories = {
    frontend: ['react','angular','vue','nextjs','html','css','tailwind','redux','svelte'],
    backend: ['node.js','nodejs','express','django','flask','fastapi','spring','laravel','graphql'],
    database: ['mongodb','mysql','postgresql','redis','sqlite','oracle','elasticsearch','dynamodb'],
    devops: ['aws','azure','gcp','docker','kubernetes','terraform','jenkins','ci/cd','github actions'],
    languages: ['javascript','python','java','typescript','go','rust','c++','c#','kotlin','swift'],
  };
  const catCount = Object.values(categories).filter(cat => cat.some(s => found.includes(s))).length;
  if (catCount >= 4) pts += 3;
  else if (catCount >= 3) pts += 2;
  else if (catCount >= 2) pts += 1;

  // JD keyword match bonus (up to 3 pts) — only if JD provided
  const jdSkillMatch = jobDescription
    ? found.filter(s => jobDescription.toLowerCase().includes(s)).length
    : 0;
  if (jdSkillMatch >= 5) pts += 3;
  else if (jdSkillMatch >= 3) pts += 2;
  else if (jdSkillMatch >= 1) pts += 1;

  pts = Math.min(25, pts);

  // Skill gap suggestions
  const webPool = ['react','typescript','node.js','mongodb','docker','aws','git','postgresql'];
  const dataPool = ['python','sql','pandas','machine learning','tensorflow','tableau','power bi'];
  const isData = /data science|machine learning|analyst|tensorflow|pandas|nlp/i.test(text);
  const suggPool = isData ? dataPool : webPool;
  const suggestions = suggPool.filter(s => !found.includes(s));

  return {
    pts: Math.max(0, Math.min(25, pts)),
    max: 25,
    found,
    suggestions,
    jdMatchCount: jdSkillMatch,
    checks: {
      skillCount: found.length,
      hasCertifications: hasCerts,
      skillsOk: found.length >= 9,
      categoryDiversity: catCount,
    },
  };
}

/**
 * STYLE scoring (max 20 pts)
 * Criteria: active voice, no buzzwords, date consistency, tense consistency
 * STRICT: earns points instead of starting high
 */
function scoreStyle(text, rawText) {
  let pts = 0;
  const issues = [];
  const checks = {};

  // Start by earning points for good practices

  // 1. No buzzwords (earn up to 5 pts)
  const foundBuzzwords = BUZZWORDS.filter(b => text.includes(b));
  if (foundBuzzwords.length === 0) pts += 5;
  else if (foundBuzzwords.length <= 1) pts += 3;
  else if (foundBuzzwords.length <= 2) pts += 1;
  else issues.push(`Remove buzzwords/clichés: ${foundBuzzwords.join(', ')}`);
  checks.buzzwords = foundBuzzwords;
  checks.buzzwordsOk = foundBuzzwords.length === 0;

  // 2. No personal pronouns (earn up to 4 pts)
  const pronounMatch = (rawText.match(/\b(I|me|my|myself|we|our)\b/g) || []).length;
  if (pronounMatch === 0) pts += 4;
  else if (pronounMatch <= 2) pts += 2;
  else if (pronounMatch <= 4) pts += 1;
  else issues.push('Avoid personal pronouns (I, me, my) — use third-person implied style');
  checks.pronounCount = pronounMatch;
  checks.noPronounsOk = pronounMatch <= 2;

  // 3. Date format consistency (earn up to 4 pts)
  const dateFormats = [
    (rawText.match(/\d{4}\s*[-–]\s*\d{4}/g) || []).length,
    (rawText.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/g) || []).length,
    (rawText.match(/\d{2}\/\d{4}/g) || []).length,
  ].filter(c => c > 0).length;
  if (dateFormats <= 1) { pts += 4; }
  else { pts += 1; issues.push('Inconsistent date formats detected — standardize to "Month Year – Month Year"'); }
  checks.dateConsistency = dateFormats <= 1;

  // 4. Active voice (earn up to 4 pts)
  const passiveMatches = (rawText.match(/\b(was|were|been|being)\s+\w+ed\b/gi) || []).length;
  if (passiveMatches === 0) pts += 4;
  else if (passiveMatches <= 2) pts += 3;
  else if (passiveMatches <= 4) pts += 1;
  else issues.push('Too many passive voice constructions — use active verbs (built, led, designed)');
  checks.passiveVoiceCount = passiveMatches;
  checks.activeVoiceOk = passiveMatches <= 2;

  // 5. Professional tone — no ALL CAPS abuse (earn up to 3 pts)
  const allCapsWords = (rawText.match(/\b[A-Z]{5,}\b/g) || []).filter(w => 
    !['EDUCATION','EXPERIENCE','SKILLS','PROJECTS','SUMMARY','ACHIEVEMENTS','CERTIFICATIONS','OBJECTIVE'].includes(w)
  ).length;
  if (allCapsWords <= 1) pts += 3;
  else if (allCapsWords <= 3) pts += 1;

  return { pts: Math.max(0, Math.min(20, pts)), max: 20, issues, checks };
}

// ─── Keyword Scoring (for JD match) ────────────────────────────────────────

function scoreKeywords(text, jobTitle, jobDescription) {
  const jd = (jobTitle + ' ' + jobDescription).toLowerCase().trim();
  if (!jd) return { pts: 0, matched: [], missing: [], jdWords: [] };

  const stopWords = new Set([
    'and','or','the','a','an','in','on','at','for','to','of','with','is','are',
    'was','were','be','have','has','had','will','would','could','should','may',
    'that','this','from','by','as','so','if','not','but','also','can','use','using',
  ]);

  const jdWords = [...new Set(
    jd.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w))
  )];

  const matched = jdWords.filter(k => text.includes(k));
  const missing = jdWords.filter(k => !text.includes(k)).slice(0, 12);
  const ratio   = jdWords.length > 0 ? matched.length / jdWords.length : 0;

  return { pts: Math.min(10, Math.round(ratio * 10)), matched: matched.slice(0, 20), missing, jdWords };
}

// ─── Grade ─────────────────────────────────────────────────────────────────

function grade(score) {
  if (score >= 80) return { letter: 'A', label: 'Excellent — ATS Ready', color: '#10b981' };
  if (score >= 65) return { letter: 'B', label: 'Good — Minor Fixes Needed', color: '#6366f1' };
  if (score >= 50) return { letter: 'C', label: 'Average — Needs Improvement', color: '#f59e0b' };
  if (score >= 35) return { letter: 'D', label: 'Below Average — Major Gaps', color: '#f97316' };
  return               { letter: 'F', label: 'Poor — Significant Overhaul Needed', color: '#ef4444' };
}

// ─── Suggestion Builder ─────────────────────────────────────────────────────

function buildSuggestions(content, format, skills, style, kw) {
  const tips = [];
  if (content.checks.sectionsMissing.includes('summary'))
    tips.push('📝 Add a 2–3 line Professional Summary tailored to the role you want');
  if (content.checks.sectionsMissing.includes('projects'))
    tips.push('📂 Add a Projects section with tech stack and measurable results');
  if (content.checks.sectionsMissing.includes('achievements'))
    tips.push('🏆 Add Achievements or Certifications section');
  if (!content.checks.hasQuantifiedImpact)
    tips.push('📊 Quantify impact — "reduced load time by 40%", "served 10k users", "saved ₹2L/month"');
  if (content.checks.actionVerbsFound < 5)
    tips.push('🔡 Use more strong action verbs: architected, engineered, optimized, spearheaded, deployed');
  if (content.checks.overusedWords && content.checks.overusedWords.length > 0)
    tips.push(`🔁 Reduce word repetition: ${content.checks.overusedWords.slice(0,4).join(', ')}`);
  if (skills.checks.skillCount < 9)
    tips.push(`⚡ Add more technical skills — you have ${skills.checks.skillCount}, aim for 9+ relevant ones`);
  if (skills.suggestions.length > 0)
    tips.push(`⚡ Consider adding in-demand skills: ${skills.suggestions.slice(0,4).join(', ')}`);
  if (skills.checks.categoryDiversity && skills.checks.categoryDiversity < 3)
    tips.push('🎯 Diversify skills across categories: frontend, backend, databases, DevOps');
  if (!format.checks.hasLinkedIn)
    tips.push('🔗 Add your LinkedIn URL — most recruiters verify candidates there');
  if (!format.checks.hasEmail)
    tips.push('📧 Add a professional email address in your header');
  if (format.checks.bulletPointCount < 5)
    tips.push('📋 Use more bullet points (aim for 8+) to structure your experience clearly');
  format.issues.forEach(i => tips.push(`⚠️ ${i}`));
  style.issues.forEach(i => tips.push(`✏️ ${i}`));
  if (kw.missing.length > 0)
    tips.push(`🎯 Insert these JD keywords where truthful: ${kw.missing.slice(0,6).join(', ')}`);
  return tips;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * analyzeResume — local heuristic analysis (fast, free)
 * Returns structured JSON mapping to the 4 ATS categories
 */
function analyzeResume(resumeText, jobTitle = '', jobDescription = '') {
  const lower = resumeText.toLowerCase();

  const content = scoreContent(lower, resumeText);
  const format  = scoreFormat(resumeText);
  const skills  = scoreSkills(lower, resumeText, jobDescription);
  const style   = scoreStyle(lower, resumeText);
  const kw      = scoreKeywords(lower, jobTitle, jobDescription);

  // Total: content(30) + format(25) + skills(25) + style(20) = 100
  // + up to 10 bonus points for JD keyword match (scaled in)
  const baseScore = content.pts + format.pts + skills.pts + style.pts;
  const kwBonus   = jobDescription ? Math.round(kw.pts * 0.5) : 0;
  const total     = Math.max(5, Math.min(100, Math.round(baseScore + kwBonus)));

  return {
    // Core score
    score:    total,
    atsScore: total,
    grade:    grade(total),

    // Category breakdown (maps to UI checklist)
    breakdown: {
      content: {
        score: Math.round(content.pts),
        max:   content.max,
        percentage: Math.round((content.pts / content.max) * 100),
        checks: content.checks,
      },
      format: {
        score: Math.round(format.pts),
        max:   format.max,
        percentage: Math.round((format.pts / format.max) * 100),
        issues: format.issues,
        checks: format.checks,
      },
      skills: {
        score: Math.round(skills.pts),
        max:   skills.max,
        percentage: Math.round((skills.pts / skills.max) * 100),
        found: skills.found,
        suggestions: skills.suggestions,
        checks: skills.checks,
      },
      style: {
        score: Math.round(style.pts),
        max:   style.max,
        percentage: Math.round((style.pts / style.max) * 100),
        issues: style.issues,
        checks: style.checks,
      },
    },

    // Legacy-compatible fields (Dashboard still reads these)
    skills:           skills.found,
    skillsDetected:   skills.found,
    suggestedSkills:  skills.suggestions,
    formattingIssues: [...format.issues, ...style.issues],
    keywordsMissing:  kw.missing,
    wordCount:        wordCount(resumeText),
    suggestions:      buildSuggestions(content, format, skills, style, kw),

    // JD match data
    jdKeywordsMatched: kw.matched,
    jdKeywordsMissing: kw.missing,
  };
}

/**
 * deepAnalyzeWithAI — calls Claude to perform a nuanced, human-quality analysis
 * Falls back to local analysis on any error
 * Use this for premium tier users or when high accuracy is needed
 */
async function deepAnalyzeWithAI(resumeText, jobTitle = '', jobDescription = '') {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return analyzeResume(resumeText, jobTitle, jobDescription);

  // Run local analysis as a baseline and fallback
  const local = analyzeResume(resumeText, jobTitle, jobDescription);

  const systemPrompt = `You are a brutally honest, senior ATS (Applicant Tracking System) specialist and professional resume screener with 15+ years of experience in tech hiring. You have reviewed over 50,000 resumes.

Your job is to perform a ruthless, realistic evaluation of a resume using 4 specific dimensions. Do NOT be lenient. A mediocre resume should score in the 30–55 range. An excellent resume might hit 80–90. Very few resumes deserve above 90.

You MUST return ONLY a valid JSON object — no markdown fences, no explanation text.`;

  const userPrompt = `Evaluate the following resume and return a structured JSON score.

${jobTitle ? `TARGET JOB TITLE: ${jobTitle}` : ''}
${jobDescription ? `JOB DESCRIPTION:\n${jobDescription.slice(0, 2000)}` : ''}

RESUME TEXT:
${resumeText.slice(0, 4000)}

Return ONLY this JSON structure (no markdown, no extra text):
{
  "overallScore": <integer 0–100, be realistic and strict>,
  "grade": {
    "letter": "<A/B/C/D/F>",
    "label": "<brief grade label>",
    "color": "<hex color matching grade>"
  },
  "breakdown": {
    "content": {
      "score": <0–30>,
      "max": 30,
      "percentage": <0–100>,
      "topIssues": ["<issue 1>", "<issue 2>"],
      "checks": {
        "hasQuantifiedImpact": <boolean>,
        "actionVerbsFound": <number>,
        "sectionsFound": ["<section>"],
        "sectionsMissing": ["<section>"],
        "weakVerbsFound": ["<verb>"],
        "overusedWords": ["<word>"]
      }
    },
    "format": {
      "score": <0–25>,
      "max": 25,
      "percentage": <0–100>,
      "issues": ["<specific formatting issue>"],
      "checks": {
        "wordCount": <number>,
        "hasEmail": <boolean>,
        "hasPhone": <boolean>,
        "hasLinkedIn": <boolean>,
        "lengthOk": <boolean>,
        "bulletPointCount": <number>,
        "specialCharsOk": <boolean>
      }
    },
    "skills": {
      "score": <0–25>,
      "max": 25,
      "percentage": <0–100>,
      "found": ["<skill>"],
      "suggestions": ["<missing in-demand skill>"],
      "checks": {
        "skillCount": <number>,
        "hasCertifications": <boolean>,
        "skillsOk": <boolean>
      }
    },
    "style": {
      "score": <0–20>,
      "max": 20,
      "percentage": <0–100>,
      "issues": ["<style issue>"],
      "checks": {
        "buzzwords": ["<buzzword found>"],
        "buzzwordsOk": <boolean>,
        "noPronounsOk": <boolean>,
        "dateConsistency": <boolean>,
        "activeVoiceOk": <boolean>
      }
    }
  },
  "suggestions": ["<actionable suggestion 1>", "<actionable suggestion 2>", ...up to 8],
  "keywordsMissing": ["<jd keyword missing from resume>"],
  "jdKeywordsMatched": ["<jd keyword present in resume>"],
  "wordCount": <number>
}`;

  try {
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const raw    = res.data.content?.[0]?.text || '{}';
    const clean  = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Merge AI result with local fallback fields for full compatibility
    return {
      score:            parsed.overallScore ?? local.score,
      atsScore:         parsed.overallScore ?? local.score,
      grade:            parsed.grade        ?? local.grade,
      breakdown:        parsed.breakdown    ?? local.breakdown,
      suggestions:      parsed.suggestions  ?? local.suggestions,
      keywordsMissing:  parsed.keywordsMissing ?? local.keywordsMissing,
      jdKeywordsMatched: parsed.jdKeywordsMatched ?? local.jdKeywordsMatched,
      jdKeywordsMissing: parsed.keywordsMissing ?? local.keywordsMissing,
      wordCount:        parsed.wordCount ?? local.wordCount,
      // Legacy fields
      skills:           parsed.breakdown?.skills?.found ?? local.skills,
      skillsDetected:   parsed.breakdown?.skills?.found ?? local.skillsDetected,
      suggestedSkills:  parsed.breakdown?.skills?.suggestions ?? local.suggestedSkills,
      formattingIssues: [
        ...(parsed.breakdown?.format?.issues ?? []),
        ...(parsed.breakdown?.style?.issues  ?? []),
      ],
      aiPowered: true,
    };
  } catch (err) {
    console.error('[deepAnalyzeWithAI] AI analysis failed, using local fallback:', err.message);
    return { ...local, aiPowered: false };
  }
}

module.exports = { analyzeResume, deepAnalyzeWithAI };