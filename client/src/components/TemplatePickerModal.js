// client/src/components/TemplatePickerModal.js
// Renders the ACTUAL tailored resume content into chosen template
// Downloads as HTML (printable to PDF via browser)

import React, { useState, useEffect, useCallback } from 'react';
import './TemplatePickerModal.css';

const RESUME_TEMPLATES = [
  {
    id: 'modern-blue',
    name: 'Modern Blue',
    description: 'Clean with indigo accents',
    accentColor: '#6366f1',
    headerBg: '#6366f1',
    headerText: '#ffffff',
    bodyBg: '#ffffff',
    bodyText: '#1a1a2e',
    sectionColor: '#6366f1',
  },
  {
    id: 'elegant-green',
    name: 'Elegant Green',
    description: 'Sophisticated & professional',
    accentColor: '#10b981',
    headerBg: '#064e3b',
    headerText: '#ffffff',
    bodyBg: '#ffffff',
    bodyText: '#1a1a1a',
    sectionColor: '#059669',
  },
  {
    id: 'minimal-white',
    name: 'Minimal White',
    description: 'Timeless, ATS-friendly',
    accentColor: '#374151',
    headerBg: '#f9fafb',
    headerText: '#111827',
    bodyBg: '#ffffff',
    bodyText: '#374151',
    sectionColor: '#111827',
  },
  {
    id: 'executive-dark',
    name: 'Executive Dark',
    description: 'Bold & authoritative',
    accentColor: '#f59e0b',
    headerBg: '#1e1b4b',
    headerText: '#ffffff',
    bodyBg: '#ffffff',
    bodyText: '#1e1b4b',
    sectionColor: '#d97706',
  },
  {
    id: 'creative-pink',
    name: 'Creative Edge',
    description: 'Bold for creative roles',
    accentColor: '#ec4899',
    headerBg: '#831843',
    headerText: '#ffffff',
    bodyBg: '#ffffff',
    bodyText: '#1f2937',
    sectionColor: '#db2777',
  },
  {
    id: 'tech-cyan',
    name: 'Tech Minimal',
    description: 'Developer-focused style',
    accentColor: '#06b6d4',
    headerBg: '#0c4a6e',
    headerText: '#ffffff',
    bodyBg: '#ffffff',
    bodyText: '#0f172a',
    sectionColor: '#0284c7',
  },
];

// ─── Generate full resume HTML from tailored result ──────────────────────────
function buildResumeHtml(template, tailoredResult, jobTitle, originalResume) {
  const t = template;

  // Extract data — handle both API shapes
  const data = tailoredResult?.data || tailoredResult || {};
  const summary = data.professionalSummary || data.summary || '';
  const skillsToAdd = data.skillsToAdd || data.suggestedSkills || [];
  const experienceBullets = data.experienceBullets || [];
  const changes = data.changes || [];

  // Get original resume data for name / contact (from the resume object)
  const filename = originalResume?.filename || 'Resume';
  // Extract a name from filename heuristic — "KowshikThotaResume.pdf" → "Kowshik Thota"
  const rawName = filename.replace(/\.(pdf|docx)$/i, '').replace(/[-_]/g, ' ');
  const candidateName = rawName.length > 3 && rawName.length < 60
    ? rawName.replace(/([A-Z])/g, ' $1').replace(/\s+/g, ' ').trim()
    : 'Candidate Name';

  // Original skills from analysis
  const originalSkills = originalResume?.analysis?.skillsDetected || [];
  const allSkills = [...new Set([...originalSkills, ...skillsToAdd])];

  // Build experience section
  const expSection = experienceBullets.length > 0
    ? experienceBullets.map(b => {
        if (typeof b === 'string') return `<li>${b}</li>`;
        return `
          <div class="exp-item">
            ${b.role ? `<div class="exp-role">${b.role}${b.company ? ` — <span class="exp-company">${b.company}</span>` : ''}</div>` : ''}
            ${b.duration ? `<div class="exp-duration">${b.duration}</div>` : ''}
            ${b.bullets ? `<ul class="exp-bullets">${b.bullets.map(bl => `<li>${bl}</li>`).join('')}</ul>` : ''}
            ${typeof b === 'string' ? `<ul><li>${b}</li></ul>` : ''}
          </div>
        `;
      }).join('')
    : '<p style="color:#888;font-style:italic;">Experience details from your uploaded resume — tailored to match ' + jobTitle + ' requirements.</p>';

  const skillsHtml = allSkills.length > 0
    ? allSkills.map(s => `<span class="skill-tag" style="background:${t.accentColor}18;color:${t.accentColor};border:1px solid ${t.accentColor}44;">${s}</span>`).join('')
    : '<span style="color:#888">See uploaded resume for skills</span>';

  const newSkillsHtml = skillsToAdd.length > 0
    ? skillsToAdd.map(s => `<span class="skill-tag new-skill" style="background:${t.accentColor}28;color:${t.accentColor};border:1px solid ${t.accentColor}66;font-weight:700;">${s} ✨</span>`).join('')
    : '';

  const changesHtml = changes.length > 0
    ? `<div class="changes-list">${changes.map(c => `<div class="change-item">✅ ${c}</div>`).join('')}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${candidateName} — ${jobTitle}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #f0f2f5;
    min-height: 100vh;
    padding: 20px;
  }

  .page {
    background: ${t.bodyBg};
    max-width: 780px;
    margin: 0 auto;
    box-shadow: 0 4px 24px rgba(0,0,0,0.14);
    border-radius: 4px;
    overflow: hidden;
  }

  /* Header */
  .resume-header {
    background: ${t.headerBg};
    color: ${t.headerText};
    padding: 36px 40px 28px;
  }

  .candidate-name {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.3px;
    margin-bottom: 6px;
  }

  .candidate-role {
    font-size: 14px;
    opacity: 0.85;
    font-weight: 500;
    letter-spacing: 0.3px;
    margin-bottom: 14px;
    text-transform: uppercase;
  }

  .header-divider {
    height: 2px;
    background: rgba(255,255,255,0.25);
    margin: 14px 0 16px;
  }

  .tailored-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255,255,255,0.2);
    border-radius: 100px;
    padding: 4px 14px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  /* Body */
  .resume-body {
    padding: 32px 40px;
    color: ${t.bodyText};
  }

  .section {
    margin-bottom: 28px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: ${t.sectionColor};
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 2px solid ${t.accentColor}30;
  }

  /* Summary */
  .summary-text {
    font-size: 13.5px;
    line-height: 1.75;
    color: ${t.bodyText};
  }

  /* Skills */
  .skills-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .skill-tag {
    padding: 4px 11px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
  }

  /* Experience */
  .exp-item {
    margin-bottom: 18px;
    padding-bottom: 18px;
    border-bottom: 1px solid #f0f0f0;
  }
  .exp-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }

  .exp-role {
    font-size: 14px;
    font-weight: 700;
    color: ${t.bodyText};
    margin-bottom: 2px;
  }

  .exp-company { color: ${t.sectionColor}; font-weight: 600; }

  .exp-duration {
    font-size: 11px;
    color: #888;
    margin-bottom: 8px;
  }

  .exp-bullets, ul.exp-bullets {
    padding-left: 18px;
    margin: 0;
  }

  .exp-bullets li, ul.exp-bullets li {
    font-size: 13px;
    line-height: 1.65;
    margin-bottom: 5px;
    color: ${t.bodyText};
  }

  /* Changes made */
  .changes-list { display: flex; flex-direction: column; gap: 6px; }
  .change-item {
    font-size: 12.5px;
    color: #15803d;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 5px;
    padding: 6px 12px;
  }

  /* Footer */
  .resume-footer {
    background: ${t.headerBg};
    padding: 10px 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .footer-template-name {
    font-size: 10px;
    opacity: 0.5;
    color: ${t.headerText};
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .footer-tailor-note {
    font-size: 10px;
    opacity: 0.5;
    color: ${t.headerText};
  }

  @media print {
    body { background: white; padding: 0; }
    .page { box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="page">

    <!-- HEADER -->
    <div class="resume-header">
      <div class="candidate-name">${candidateName}</div>
      <div class="candidate-role">${jobTitle}</div>
      <div class="header-divider"></div>
      <span class="tailored-badge">✨ AI-Tailored for ${jobTitle}</span>
    </div>

    <!-- BODY -->
    <div class="resume-body">

      ${summary ? `
      <div class="section">
        <div class="section-title">Professional Summary</div>
        <p class="summary-text">${summary}</p>
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">Skills</div>
        <div class="skills-wrap">${skillsHtml}</div>
        ${newSkillsHtml ? `<div style="margin-top:10px;"><div style="font-size:11px;color:#888;margin-bottom:6px;font-weight:600;">RECOMMENDED TO ADD:</div><div class="skills-wrap">${newSkillsHtml}</div></div>` : ''}
      </div>

      <div class="section">
        <div class="section-title">Experience</div>
        ${expSection}
      </div>

      ${changes.length > 0 ? `
      <div class="section">
        <div class="section-title">AI Improvements Made</div>
        ${changesHtml}
      </div>
      ` : ''}

    </div>

    <!-- FOOTER -->
    <div class="resume-footer">
      <span class="footer-template-name">Rezona · ${t.name}</span>
      <span class="footer-tailor-note">Tailored resume · Print or save as PDF</span>
    </div>

  </div>
</body>
</html>`;
}

// ─── Template Card Mockup ─────────────────────────────────────────────────────
function TemplateMockup({ template, selected, onSelect }) {
  const t = template;
  return (
    <button
      className={`tpicker-card ${selected ? 'tpicker-card--active' : ''}`}
      onClick={() => onSelect(t.id)}
      style={{ '--tmpl-accent': t.accentColor }}
      aria-pressed={selected}
    >
      {selected && <div className="tpicker-card__check">✓</div>}

      <div className="tpicker-mock">
        {/* Mini header */}
        <div className="tpicker-mock__header" style={{ background: t.headerBg, padding: '10px 10px 8px' }}>
          <div style={{ height: 8, borderRadius: 2, background: 'rgba(255,255,255,0.8)', width: '65%', marginBottom: 5 }} />
          <div style={{ height: 5, borderRadius: 2, background: 'rgba(255,255,255,0.4)', width: '40%' }} />
          <div style={{ height: 2, background: 'rgba(255,255,255,0.25)', marginTop: 8 }} />
        </div>
        {/* Mini body */}
        <div className="tpicker-mock__body" style={{ background: t.bodyBg }}>
          <div style={{ height: 4, borderRadius: 2, background: t.accentColor + '60', width: '30%', marginBottom: 7 }} />
          <div style={{ height: 4, borderRadius: 2, background: '#e5e7eb', width: '90%', marginBottom: 4 }} />
          <div style={{ height: 4, borderRadius: 2, background: '#e5e7eb', width: '75%', marginBottom: 10 }} />
          <div style={{ height: 4, borderRadius: 2, background: t.accentColor + '60', width: '25%', marginBottom: 7 }} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[40, 55, 35, 48].map((w, i) => (
              <div key={i} style={{ height: 12, borderRadius: 3, background: t.accentColor + '28', width: w }} />
            ))}
          </div>
        </div>
      </div>

      <div className="tpicker-card__info">
        <h3>{t.name}</h3>
        <p>{t.description}</p>
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const TemplatePickerModal = ({ tailoredResult, jobTitle, originalResume, onClose }) => {
  const preSelected = tailoredResult?.selectedTemplate || 'modern-blue';
  const [selectedId, setSelectedId] = useState(preSelected);
  const [showPreview, setShowPreview] = useState(true); // Go directly to preview since template was already chosen
  const [previewHtml, setPreviewHtml] = useState('');

  const selectedTemplate = RESUME_TEMPLATES.find(t => t.id === selectedId);

  // Regenerate preview whenever template or data changes
  const rebuildPreview = useCallback(() => {
    if (!selectedTemplate) return;
    const html = buildResumeHtml(selectedTemplate, tailoredResult, jobTitle, originalResume);
    setPreviewHtml(html);
  }, [selectedId, tailoredResult, jobTitle, originalResume]);

  useEffect(() => { rebuildPreview(); }, [rebuildPreview]);

  // Close on Escape
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleDownload = () => {
    const html = buildResumeHtml(selectedTemplate, tailoredResult, jobTitle, originalResume);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (jobTitle || 'resume').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    a.download = `tailored_resume_${safeName}_${selectedTemplate.name.replace(/\s/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const iframe = document.getElementById('tpicker-preview-frame');
    if (iframe) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }
  };

  return (
    <div
      className="tpicker-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`tpicker-modal ${showPreview ? 'tpicker-modal--wide' : ''}`}>

        {/* ── Header ── */}
        <div className="tpicker-header">
          <div className="tpicker-header__left">
            {showPreview && (
              <button className="tpicker-back" onClick={() => setShowPreview(false)}>← Back</button>
            )}
            <div>
              <h2 className="tpicker-title">
                {showPreview ? `Preview — ${selectedTemplate?.name}` : 'Choose a Template'}
              </h2>
              <p className="tpicker-subtitle">
                {showPreview
                  ? 'Your tailored resume rendered in this template. Print or download as HTML → open in browser → Save as PDF.'
                  : `Your resume has been tailored for "${jobTitle}". Pick a style to download.`}
              </p>
            </div>
          </div>
          <button className="tpicker-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ── Template Grid ── */}
        {!showPreview && (
          <>
            <div className="tpicker-value-banner">
              <span aria-hidden="true">✨</span>
              <p>
                Your resume has been AI-tailored with a new professional summary, aligned skills, and
                rewritten experience bullets. Choose a template to preview and download.
              </p>
            </div>

            <div className="tpicker-body">
              <div className="tpicker-grid">
                {RESUME_TEMPLATES.map(t => (
                  <TemplateMockup
                    key={t.id}
                    template={t}
                    selected={selectedId === t.id}
                    onSelect={setSelectedId}
                  />
                ))}
              </div>
            </div>

            <div className="tpicker-download-note">
              💡 Select a template, then click <strong>Preview</strong> to see your tailored resume.
            </div>

            <div className="tpicker-actions">
              <button className="tpicker-btn-ghost" onClick={onClose}>Cancel</button>
              <button className="tpicker-btn-primary" onClick={() => setShowPreview(true)}>
                👁 Preview Resume
              </button>
            </div>
          </>
        )}

        {/* ── Preview ── */}
        {showPreview && (
          <div className="tpicker-preview-wrap">
            <div className="tpicker-preview-toolbar">
              <span className="tpicker-preview-badge">
                {selectedTemplate?.name} · Tailored for {jobTitle}
              </span>
              <div className="tpicker-preview-btns">
                <button className="tpicker-btn-ghost" onClick={handlePrint}>
                  🖨 Print / Save PDF
                </button>
                <button className="tpicker-btn-primary" onClick={handleDownload}>
                  📥 Download HTML
                </button>
              </div>
            </div>

            <div className="tpicker-iframe-wrap">
              {previewHtml && (
                <iframe
                  id="tpicker-preview-frame"
                  className="tpicker-iframe"
                  srcDoc={previewHtml}
                  title="Resume Preview"
                  sandbox="allow-same-origin allow-modals"
                />
              )}
            </div>

            <div className="tpicker-download-note">
              💡 <strong>To save as PDF:</strong> Click "Print / Save PDF" → in the print dialog choose "Save as PDF" as the destination.
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default TemplatePickerModal;