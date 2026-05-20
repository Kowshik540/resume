// server/services/resumeModifier.js
// Uses Claude AI to rewrite resume sections tailored to a specific job description

const axios = require('axios');

/**
 * Auto-modify a resume to match a specific job
 * @param {string} resumeText     - original resume text
 * @param {string} jobTitle       - job title
 * @param {string} jobDescription - full job description
 * @param {string[]} missingSkills - skills in JD not found in resume
 * @returns {object} { professionalSummary, skillsToAdd, experienceBullets, changes, atsImprovementEstimate }
 */
async function modifyResumeForJob(resumeText, jobTitle, jobDescription, missingSkills = []) {
  // Try providers in order: Groq (free) → Anthropic (paid) → Local fallback
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  const prompt = `You are an expert resume writer and ATS optimization specialist.

A candidate has applied for the following job and needs their resume tailored to maximize ATS score and relevance.

=== JOB TITLE ===
${jobTitle}

=== JOB DESCRIPTION ===
${jobDescription.slice(0, 2000)}

=== CANDIDATE'S CURRENT RESUME ===
${resumeText.slice(0, 3000)}

=== MISSING SKILLS IN RESUME (from JD) ===
${missingSkills.join(', ') || 'None identified'}

Your task: Rewrite key resume sections to better match this job. Follow these strict rules:
1. NEVER fabricate experience, companies, degrees, or projects the candidate did not have
2. DO rephrase existing experience using keywords from the job description
3. DO strengthen the professional summary to align with this role
4. DO add any legitimately implied skills (e.g. if they used React, they know JSX/hooks)
5. DO quantify achievements where possible using numbers already present
6. Keep tone professional and ATS-friendly (no tables, no columns, no special chars)

Respond with ONLY a valid JSON object (no markdown, no explanation) in this exact structure:
{
  "professionalSummary": "2-3 sentence rewritten summary targeting this job",
  "skillsToAdd": ["skill1", "skill2"],
  "experienceBullets": [
    {
      "context": "Brief note on which job/project this applies to",
      "original": "original bullet point text",
      "improved": "rewritten bullet using JD keywords and stronger action verbs"
    }
  ],
  "changes": [
    "Short plain-English description of each change made"
  ],
  "atsImprovementEstimate": 15
}`;

  // ─── Try Groq first (FREE, fast, no credit card needed) ───
  if (GROQ_API_KEY) {
    try {
      console.log('[resumeModifier] Using Groq (free tier)...');
      const res = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'You are an expert resume writer. Always respond with valid JSON only, no markdown fences.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 1500,
        },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const raw = res.data.choices?.[0]?.message?.content || '{}';
      const clean = raw.replace(/```json|```/g, '').trim();
      const result = JSON.parse(clean);

      return {
        professionalSummary:    result.professionalSummary    || '',
        skillsToAdd:            result.skillsToAdd            || [],
        experienceBullets:      result.experienceBullets      || [],
        changes:                result.changes                || [],
        atsImprovementEstimate: result.atsImprovementEstimate || 0,
        aiProvider: 'groq',
      };
    } catch (err) {
      console.error('[resumeModifier] Groq API error:', err.response?.status, err.response?.data?.error?.message || err.message);
      // Fall through to next provider
    }
  }

  // ─── Try Anthropic (paid) ───
  if (ANTHROPIC_API_KEY) {
    try {
      console.log('[resumeModifier] Using Anthropic...');
      const res = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          messages:   [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            'x-api-key':         ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type':      'application/json',
          },
          timeout: 30000,
        }
      );

      const raw   = res.data.content?.[0]?.text || '{}';
      const clean = raw.replace(/```json|```/g, '').trim();
      const result = JSON.parse(clean);

      return {
        professionalSummary:    result.professionalSummary    || '',
        skillsToAdd:            result.skillsToAdd            || [],
        experienceBullets:      result.experienceBullets      || [],
        changes:                result.changes                || [],
        atsImprovementEstimate: result.atsImprovementEstimate || 0,
        aiProvider: 'anthropic',
      };
    } catch (err) {
      console.error('[resumeModifier] Anthropic API error:', err.response?.status, err.response?.data?.error?.message || err.message);
      // Fall through to local
    }
  }

  // ─── Local fallback (always works, no API needed) ───
  console.log('[resumeModifier] Using local modification engine (no API keys configured or all failed)');
  return localModifyFallback(resumeText, jobTitle, jobDescription, missingSkills);
}

/**
 * Local fallback modifier — works without API key
 * Generates tailored content by analyzing JD keywords vs resume skills
 */
function localModifyFallback(resumeText, jobTitle, jobDescription, missingSkills = []) {
  const jdLower = (jobTitle + ' ' + jobDescription).toLowerCase();
  const resumeLower = resumeText.toLowerCase();

  // Extract JD keywords (meaningful words that appear frequently)
  const stopWords = new Set(['and','or','the','a','an','in','on','at','for','to','of','with','is','are','was','were','be','have','has','had','will','would','could','should','may','that','this','from','by','as','so','if','not','but','also','can','use','using','our','we','you','your','team','work','role','experience','looking','join','ability','strong','well','good','must','including','etc','based']);
  const jdWords = jdLower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
  const freq = {};
  jdWords.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  const topKeywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w]) => w);

  // Find skills mentioned in JD but not in resume
  const techSkills = ['react','angular','vue','typescript','javascript','python','java','node.js','express','mongodb','postgresql','docker','kubernetes','aws','azure','gcp','graphql','redis','django','flask','tensorflow','pytorch','pandas','sql','git','linux','nginx','terraform','jenkins','agile','scrum','figma','tailwind','next.js','flutter','kotlin','swift','go','rust'];
  const jdSkills = techSkills.filter(s => jdLower.includes(s));
  const resumeSkills = techSkills.filter(s => resumeLower.includes(s));
  const skillsToAdd = jdSkills.filter(s => !resumeSkills.includes(s)).slice(0, 6);

  // Generate professional summary
  const topResumeSkills = resumeSkills.slice(0, 4).join(', ') || 'modern technologies';
  const professionalSummary = `Results-driven ${jobTitle} with hands-on experience in ${topResumeSkills}. Proven ability to deliver high-quality, scalable solutions with a focus on ${topKeywords.slice(0, 2).join(' and ') || 'performance and reliability'}. Eager to contribute expertise in ${skillsToAdd[0] || resumeSkills[0] || 'software development'} to drive impactful outcomes.`;

  // Generate improved bullets
  const experienceBullets = [
    {
      context: 'Technical Delivery',
      original: 'Worked on web applications and features.',
      improved: `Designed and delivered production-grade features using ${resumeSkills[0] || 'modern frameworks'}, aligning with ${topKeywords[0] || 'scalability'} and ${topKeywords[1] || 'performance'} requirements outlined for this ${jobTitle} role.`,
    },
    {
      context: 'Performance & Optimization',
      original: 'Improved application performance.',
      improved: `Optimized application architecture resulting in measurable improvements to ${topKeywords[2] || 'load times'} and user experience, directly relevant to the ${topKeywords[3] || 'technical'} challenges of this position.`,
    },
    {
      context: 'Collaboration & Leadership',
      original: 'Collaborated with team members.',
      improved: `Led cross-functional collaboration with engineering and product teams to deliver ${topKeywords[4] || 'feature'}-aligned solutions, demonstrating the communication skills required for this ${jobTitle} opportunity.`,
    },
  ];

  const changes = [
    `Rewrote professional summary targeting "${jobTitle}"`,
    `Identified ${skillsToAdd.length} skills to highlight: ${skillsToAdd.slice(0, 3).join(', ') || 'None missing'}`,
    `Aligned bullet points with ${topKeywords.length} JD keywords`,
    'Applied action verbs and quantification patterns for ATS optimization',
  ];

  return {
    professionalSummary,
    skillsToAdd,
    experienceBullets,
    changes,
    atsImprovementEstimate: Math.min(skillsToAdd.length * 3 + 10, 22),
    localFallback: true,
  };
}

module.exports = { modifyResumeForJob };