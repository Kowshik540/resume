// server/routes/resume.js

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const pdfParse = require('pdf-parse');

const auth                  = require('../middleware/auth');
const Resume                = require('../models/Resume');
const { analyzeResume }     = require('../services/atsAnalyzer');
const { fetchJobs }         = require('../services/jobMatcher');
const { modifyResumeForJob} = require('../services/resumeModifier');

const router = express.Router();

// ─── Multer ───────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf')
      return cb(new Error('Only PDF files are allowed'));
    cb(null, true);
  },
});

// ─── POST /api/resume/analyze ─────────────────────────────────────────────────
router.post('/analyze', auth, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Please upload a PDF' });

    const pdfData    = await pdfParse(fs.readFileSync(req.file.path));
    const resumeText = pdfData.text || '';

    if (resumeText.trim().length < 50) {
      return res.status(422).json({
        error: 'Cannot read text from this PDF. Make sure it is not a scanned image.',
      });
    }

    const { jobTitle = '', jobDescription = '', city = 'India' } = req.body;

    const analysis = analyzeResume(resumeText, jobTitle, jobDescription);
    const jobs     = await fetchJobs(analysis.skills, jobTitle, city);

    const record = await Resume.create({
      userId:     req.user.id,
      filename:   req.file.originalname,
      filepath:   req.file.path,
      resumeText, // ✅ stored in schema now
      atsScore:   analysis.score,
      skills:     analysis.skills,
      analysis,
      jobs: jobs.slice(0, 10),
    });

    res.json({ success: true, resumeId: record._id, analysis, jobs });
  } catch (err) {
    console.error('[analyze]', err);
    res.status(500).json({ error: err.message || 'Analysis failed' });
  }
});

// ─── POST /api/resume/jobs ────────────────────────────────────────────────────
router.post('/jobs', auth, async (req, res) => {
  try {
    const { skills = [], jobTitle = '', city = 'India', filters = {} } = req.body;
    const jobs = await fetchJobs(skills, jobTitle, city, filters);
    res.json({ success: true, jobs });
  } catch (err) {
    console.error('[jobs]', err);
    res.status(500).json({ error: 'Could not fetch jobs' });
  }
});

// ─── POST /api/resume/modify ──────────────────────────────────────────────────
// Auto-modify resume text for a specific job using Claude AI
// Body: { resumeId, jobTitle, jobDescription, missingSkills, skills? }
// 3-tier fallback: DB resumeText → PDF re-parse → skills stub
router.post('/modify', auth, async (req, res) => {
  try {
    const { resumeId, jobTitle, jobDescription, missingSkills = [], skills = [] } = req.body;

    if (!jobTitle || !jobDescription) {
      return res.status(400).json({ error: 'jobTitle and jobDescription are required' });
    }

    let resumeText = '';
    let usedFallback = false;

    if (resumeId) {
      const record = await Resume.findOne({ _id: resumeId, userId: req.user.id });

      if (record?.resumeText && record.resumeText.trim().length > 50) {
        // ✅ Tier 1 — best case: text already stored in DB
        resumeText = record.resumeText;

      } else if (record?.filepath && fs.existsSync(record.filepath)) {
        // ✅ Tier 2 — re-parse the PDF file for records uploaded before schema fix
        console.log('[modify] Tier 2: re-parsing PDF from', record.filepath);
        try {
          const pdfData = await pdfParse(fs.readFileSync(record.filepath));
          resumeText = pdfData.text || '';
          if (resumeText.trim().length > 50) {
            // Backfill so next call is instant
            await Resume.updateOne({ _id: record._id }, { $set: { resumeText } });
            console.log('[modify] Backfilled resumeText for record', record._id);
          }
        } catch (parseErr) {
          console.error('[modify] PDF re-parse failed:', parseErr.message);
        }

      } else if (record?.skills?.length) {
        // ✅ Tier 3 — file missing, build a minimal stub from stored skills
        console.log('[modify] Tier 3: building stub from stored skills');
        usedFallback = true;
        resumeText = `Candidate Profile\n\nSkills: ${record.skills.join(', ')}\n\nExperience: Software developer with experience in ${record.skills.slice(0, 5).join(', ')}.`;
      }
    }

    // Last resort — use skills array sent from client
    if ((!resumeText || resumeText.trim().length < 50) && skills.length) {
      console.log('[modify] Tier 3b: building stub from client skills');
      usedFallback = true;
      resumeText = `Candidate Profile\n\nSkills: ${skills.join(', ')}\n\nExperience: Software developer with experience in ${skills.slice(0, 5).join(', ')}.`;
    }

    if (!resumeText || resumeText.trim().length < 10) {
      return res.status(400).json({
        error: 'Could not load resume content. Please re-upload your resume PDF and try again.',
      });
    }

    const result = await modifyResumeForJob(resumeText, jobTitle, jobDescription, missingSkills);
    res.json({ success: true, ...result, usedFallback });
  } catch (err) {
    console.error('[modify]', err);
    res.status(500).json({ error: err.message || 'Modification failed' });
  }
});

// ─── GET /api/resume/history ──────────────────────────────────────────────────
router.get('/history', auth, async (req, res) => {
  try {
    const resumes = await Resume
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .select('-resumeText') // don't send raw text in list
      .limit(20);
    res.json({ success: true, resumes });
  } catch (err) {
    res.status(500).json({ error: 'Could not load history' });
  }
});

// ─── GET /api/resume/:id ──────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, userId: req.user.id })
      .select('-resumeText');
    if (!resume) return res.status(404).json({ error: 'Resume not found' });
    res.json({ success: true, resume });
  } catch (err) {
    res.status(500).json({ error: 'Could not load resume' });
  }
});

// ─── DELETE /api/resume/:id ───────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, userId: req.user.id });
    if (!resume) return res.status(404).json({ error: 'Not found' });
    if (resume.filepath && fs.existsSync(resume.filepath)) fs.unlinkSync(resume.filepath);
    await resume.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ─── POST /api/resume/reanalyze ──────────────────────────────────────────────
// Re-run ATS analysis on an existing resume (e.g. after user edits or with JD context)
router.post('/reanalyze', auth, async (req, res) => {
  try {
    const { resumeId, jobTitle = '', jobDescription = '' } = req.body;
    if (!resumeId) return res.status(400).json({ error: 'resumeId is required' });

    const record = await Resume.findOne({ _id: resumeId, userId: req.user.id });
    if (!record) return res.status(404).json({ error: 'Resume not found' });

    let resumeText = record.resumeText || '';

    // If no stored text, try to re-parse the PDF
    if (!resumeText && record.filepath && fs.existsSync(record.filepath)) {
      const pdfData = await pdfParse(fs.readFileSync(record.filepath));
      resumeText = pdfData.text || '';
      if (resumeText.trim().length > 50) {
        await Resume.updateOne({ _id: record._id }, { $set: { resumeText } });
      }
    }

    if (!resumeText || resumeText.trim().length < 50) {
      return res.status(422).json({ error: 'Cannot read resume text. Please re-upload.' });
    }

    const analysis = analyzeResume(resumeText, jobTitle, jobDescription);

    // Update stored analysis and score
    await Resume.updateOne({ _id: record._id }, {
      $set: { atsScore: analysis.score, analysis, skills: analysis.skills }
    });

    res.json({ success: true, analysis });
  } catch (err) {
    console.error('[reanalyze]', err);
    res.status(500).json({ error: err.message || 'Re-analysis failed' });
  }
});

// ─── POST /api/resume/download ───────────────────────────────────────────────
// Acknowledge download request - actual HTML rendering happens client-side
router.post('/download', auth, async (req, res) => {
  try {
    const { resumeId, templateId, jobTitle } = req.body;

    if (!resumeId || !templateId) {
      return res.status(400).json({ error: 'resumeId and templateId are required' });
    }

    const record = await Resume.findOne({ _id: resumeId, userId: req.user.id });
    if (!record) return res.status(404).json({ error: 'Resume not found' });

    res.json({
      success: true,
      message: 'Use client-side template rendering for download',
      resumeId: record._id,
      templateId,
      jobTitle: jobTitle || '',
    });
  } catch (err) {
    console.error('[download]', err);
    res.status(500).json({ error: 'Download generation failed' });
  }
});

module.exports = router;
