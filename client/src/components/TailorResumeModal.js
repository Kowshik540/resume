// client/src/components/TailorResumeModal.js
// UPGRADE 3 — Step-based Tailoring Wizard
// Flow: Step 1 (Select Template) → Step 2 (Enter JD) → Step 3 (Processing) → Done
// Props:
//   resumeId  - MongoDB _id of the resume record
//   skills    - string[] of detected skills from analysis
//   onClose   - () => void
//   onTailored - (result, jobTitle, jobDescription) => void  <-- triggers template picker

import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import './TailorResumeModal.css';

const MAX_JD_CHARS = 5000;

const TEMPLATES = [
  { id: 'modern-blue', name: 'Modern Blue', description: 'Clean with indigo accents — great for tech', color: '#6366f1' },
  { id: 'elegant-green', name: 'Elegant Green', description: 'Sophisticated & professional', color: '#10b981' },
  { id: 'minimal-white', name: 'Minimal White', description: 'Timeless, highly ATS-friendly', color: '#374151' },
  { id: 'executive-dark', name: 'Executive Dark', description: 'Bold & authoritative for senior roles', color: '#f59e0b' },
  { id: 'creative-pink', name: 'Creative Edge', description: 'Bold for creative & design roles', color: '#ec4899' },
  { id: 'tech-cyan', name: 'Tech Minimal', description: 'Developer-focused with clean structure', color: '#06b6d4' },
];

const EXAMPLE_JDS = [
  {
    role: 'Senior Frontend Engineer',
    jd: 'We are looking for a Senior Frontend Engineer with 3+ years of experience in React.js, TypeScript, and modern CSS frameworks (Tailwind preferred). You will lead UI architecture decisions, mentor junior developers, and deliver pixel-perfect, accessible web experiences. Strong understanding of web performance, SEO, and CI/CD pipelines is required.',
  },
  {
    role: 'Data Scientist',
    jd: 'Seeking a Data Scientist with expertise in Python, Pandas, Scikit-learn, and SQL. You will build predictive models, perform A/B testing analysis, and collaborate with product teams to drive data-driven decisions. Experience with TensorFlow or PyTorch is a plus.',
  },
  {
    role: 'Full Stack Developer',
    jd: 'Join our team as a Full Stack Developer. You must have hands-on experience with Node.js, Express, React, and MongoDB. Responsibilities include designing RESTful APIs, building responsive UIs, and deploying applications on AWS. Docker and Kubernetes experience is desirable.',
  },
];

const TailorResumeModal = ({ resumeId, skills = [], onClose, onTailored }) => {
  const [step, setStep] = useState(1); // 1=template, 2=JD, 3=processing
  const [selectedTemplate, setSelectedTemplate] = useState('modern-blue');
  const [jobRole, setJobRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [charCount, setCharCount] = useState(0);
  const [progressStep, setProgressStep] = useState(0);
  const modalRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !loading) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, loading]);

  // Auto-focus job role input on step 2
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => document.getElementById('tailor-job-role')?.focus(), 150);
    }
  }, [step]);

  // Animate progress steps during loading
  useEffect(() => {
    if (!loading) { setProgressStep(0); return; }
    const timers = [
      setTimeout(() => setProgressStep(1), 1500),
      setTimeout(() => setProgressStep(2), 3500),
      setTimeout(() => setProgressStep(3), 6000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  const handleJdChange = (e) => {
    const val = e.target.value.slice(0, MAX_JD_CHARS);
    setJobDescription(val);
    setCharCount(val.length);
  };

  const fillExample = (ex) => {
    setJobRole(ex.role);
    setJobDescription(ex.jd);
    setCharCount(ex.jd.length);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!jobRole.trim()) { setError('Please enter a job role / title.'); return; }
    if (!jobDescription.trim() || jobDescription.trim().length < 50) {
      setError('Please paste a full job description (at least 50 characters).');
      return;
    }

    setError('');
    setLoading(true);
    setStep(3);

    try {
      const payload = {
        resumeId,
        jobTitle: jobRole.trim(),
        jobDescription: jobDescription.trim(),
        missingSkills: [],
        skills,
      };

      const { data } = await api.post('/resume/modify', payload);

      if (!data.success) throw new Error(data.error || 'Tailoring failed');

      // Pass result + selected template to parent
      onTailored({ ...data, selectedTemplate }, jobRole.trim(), jobDescription.trim());
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Something went wrong. Please try again.');
      setStep(2);
    }

    setLoading(false);
  };

  const canProceedToStep2 = !!selectedTemplate;
  const canSubmit = jobRole.trim().length > 0 && jobDescription.trim().length >= 50;

  return (
    <div className="tailor-overlay" role="dialog" aria-modal="true" aria-label="Tailor Resume Wizard"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="tailor-modal" ref={modalRef}>

        {/* Header with step indicator */}
        <div className="tailor-modal__header">
          <div className="tailor-modal__title-row">
            <span className="tailor-modal__icon">{step === 1 ? '🎨' : step === 2 ? '🎯' : '⚙️'}</span>
            <div>
              <h2 className="tailor-modal__title">
                {step === 1 && 'Step 1: Choose Your Template'}
                {step === 2 && 'Step 2: Enter Job Details'}
                {step === 3 && 'Tailoring Your Resume...'}
              </h2>
              <p className="tailor-modal__subtitle">
                {step === 1 && 'Select a resume template first — your tailored content will be formatted with this design.'}
                {step === 2 && 'Paste the job description. Our AI rewrites your resume to match this exact role.'}
                {step === 3 && 'AI is analyzing and rewriting your resume sections.'}
              </p>
            </div>
          </div>
          <button className="tailor-modal__close" onClick={onClose} aria-label="Close" disabled={loading}>✕</button>
        </div>

        {/* Step Progress Bar */}
        <div className="tailor-steps-bar">
          <div className={`tailor-step-indicator ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}>
            <span className="step-num">{step > 1 ? '✓' : '1'}</span>
            <span className="step-label">Template</span>
          </div>
          <div className="step-connector"><div className={`connector-fill ${step >= 2 ? 'filled' : ''}`} /></div>
          <div className={`tailor-step-indicator ${step >= 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`}>
            <span className="step-num">{step > 2 ? '✓' : '2'}</span>
            <span className="step-label">Job Details</span>
          </div>
          <div className="step-connector"><div className={`connector-fill ${step >= 3 ? 'filled' : ''}`} /></div>
          <div className={`tailor-step-indicator ${step >= 3 ? 'active' : ''}`}>
            <span className="step-num">3</span>
            <span className="step-label">Generate</span>
          </div>
        </div>

        {/* Step 1: Template Selection */}
        {step === 1 && (
          <div className="tailor-modal__body">
            <div className="template-grid">
              {TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  className={`template-card ${selectedTemplate === tmpl.id ? 'template-card--active' : ''}`}
                  onClick={() => setSelectedTemplate(tmpl.id)}
                  style={{ '--tmpl-color': tmpl.color }}
                >
                  {selectedTemplate === tmpl.id && <div className="template-check">✓</div>}
                  <div className="template-preview">
                    <div className="tmpl-header-bar" style={{ background: tmpl.color }} />
                    <div className="tmpl-body-lines">
                      <div className="tmpl-line" style={{ width: '70%' }} />
                      <div className="tmpl-line" style={{ width: '90%' }} />
                      <div className="tmpl-line" style={{ width: '55%' }} />
                      <div className="tmpl-dots">
                        {[38, 48, 32, 44].map((w, i) => (
                          <span key={i} className="tmpl-dot" style={{ width: w, background: tmpl.color + '30' }} />
                        ))}
                      </div>
                      <div className="tmpl-line" style={{ width: '80%' }} />
                      <div className="tmpl-line" style={{ width: '60%' }} />
                    </div>
                  </div>
                  <div className="template-info">
                    <h4>{tmpl.name}</h4>
                    <p>{tmpl.description}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="tailor-modal__actions">
              <button type="button" className="tailor-btn-ghost" onClick={onClose}>Cancel</button>
              <button
                type="button"
                className="tailor-btn-primary"
                onClick={() => setStep(2)}
                disabled={!canProceedToStep2}
              >
                Next: Enter Job Details →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Job Description Form */}
        {step === 2 && (
          <div className="tailor-modal__body">
            {/* Quick Fill Examples */}
            <div className="tailor-modal__examples">
              <span className="tailor-modal__examples-label">Try an example:</span>
              {EXAMPLE_JDS.map((ex) => (
                <button key={ex.role} className="example-chip" onClick={() => fillExample(ex)}>
                  {ex.role}
                </button>
              ))}
            </div>

            <form className="tailor-modal__form" onSubmit={handleSubmit}>
              <div className="tailor-field">
                <label htmlFor="tailor-job-role" className="tailor-label">
                  Job Role / Title <span className="required">*</span>
                </label>
                <input
                  id="tailor-job-role"
                  type="text"
                  className="tailor-input"
                  placeholder="e.g. Senior Frontend Engineer, Data Scientist, DevOps Lead…"
                  value={jobRole}
                  onChange={(e) => setJobRole(e.target.value)}
                  maxLength={120}
                  disabled={loading}
                />
              </div>

              <div className="tailor-field">
                <label htmlFor="tailor-jd" className="tailor-label">
                  Job Description <span className="required">*</span>
                </label>
                <p className="tailor-field-hint">
                  Paste the complete job posting. The more detail you include, the better the tailoring.
                </p>
                <textarea
                  id="tailor-jd"
                  className="tailor-textarea"
                  placeholder="Paste the full job description here — requirements, responsibilities, tech stack, soft skills…"
                  value={jobDescription}
                  onChange={handleJdChange}
                  rows={8}
                  disabled={loading}
                />
                <div className="tailor-char-count">
                  <span className={charCount > MAX_JD_CHARS * 0.9 ? 'warn' : ''}>
                    {charCount.toLocaleString()}
                  </span>
                  <span> / {MAX_JD_CHARS.toLocaleString()} chars</span>
                </div>
              </div>

              {error && (
                <div className="tailor-error" role="alert">
                  <span className="error-icon">⚠</span> {error}
                </div>
              )}

              <div className="tailor-value-banner">
                <span>✨</span>
                <p>Your resume will be tailored with the <strong>{TEMPLATES.find(t => t.id === selectedTemplate)?.name}</strong> template and ready to download as PDF.</p>
              </div>

              <div className="tailor-modal__actions">
                <button type="button" className="tailor-btn-ghost" onClick={() => setStep(1)} disabled={loading}>
                  ← Back
                </button>
                <button type="submit" className="tailor-btn-primary" disabled={loading || !canSubmit}>
                  {loading ? (
                    <><span className="tailor-spinner" /> Tailoring…</>
                  ) : (
                    <>🚀 Tailor My Resume</>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Step 3: Processing Animation */}
        {step === 3 && (
          <div className="tailor-modal__body tailor-processing">
            <div className="processing-visual">
              <div className="processing-ring">
                <div className="processing-ring-inner" />
              </div>
            </div>
            <div className="tailor-progress">
              {['Analyzing job requirements', 'Mapping skills & keywords', 'Rewriting resume sections', 'Formatting with template'].map((label, idx) => (
                <div key={idx} className={`tailor-progress__step ${progressStep >= idx ? 'active' : ''} ${progressStep > idx ? 'done' : ''}`}>
                  <span className="tailor-progress__dot" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TailorResumeModal;