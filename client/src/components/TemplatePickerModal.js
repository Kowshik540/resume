// client/src/components/TemplatePickerModal.js
// Generates a REAL professional resume from the user's uploaded data + AI tailoring

import React, { useState, useEffect, useCallback } from 'react';
import './TemplatePickerModal.css';

const RESUME_TEMPLATES = [
  { id: 'modern-blue', name: 'Modern Blue', accentColor: '#6366f1', headerBg: '#6366f1', headerText: '#ffffff', bodyBg: '#ffffff', bodyText: '#1a1a2e', sectionColor: '#6366f1' },
  { id: 'elegant-green', name: 'Elegant Green', accentColor: '#10b981', headerBg: '#064e3b', headerText: '#ffffff', bodyBg: '#ffffff', bodyText: '#1a1a1a', sectionColor: '#059669' },
  { id: 'minimal-white', name: 'Minimal White', accentColor: '#374151', headerBg: '#f9fafb', headerText: '#111827', bodyBg: '#ffffff', bodyText: '#374151', sectionColor: '#111827' },
  { id: 'executive-dark', name: 'Executive Dark', accentColor: '#f59e0b', headerBg: '#1e1b4b', headerText: '#ffffff', bodyBg: '#ffffff', bodyText: '#1e1b4b', sectionColor: '#d97706' },
  { id: 'creative-pink', name: 'Creative Edge', accentColor: '#ec4899', headerBg: '#831843', headerText: '#ffffff', bodyBg: '#ffffff', bodyText: '#1f2937', sectionColor: '#db2777' },
  { id: 'tech-cyan', name: 'Tech Minimal', accentColor: '#06b6d4', headerBg: '#0c4a6e', headerText: '#ffffff', bodyBg: '#ffffff', bodyText: '#0f172a', sectionColor: '#0284c7' },
];

// ─── Build a REAL resume HTML ────────────────────────────────────────────────
function buildResumeHtml(template, tailoredResult, jobTitle, originalResume) {
  const t = template;
  const data = tailoredResult?.data || tailoredResult || {};
  
  // AI-generated content
  const summary = data.professionalSummary || '';
  const skillsToAdd = data.skillsToAdd || [];
  const experienceBullets = data.experienceBullets || [];

  // Original resume data
  const originalSkills = originalResume?.analysis?.skillsDetected || [];
  const allSkills = [...new Set([...originalSkills, ...skillsToAdd])];
  
  // Extract name from filename: "KowshikResume.pdf" → "Kowshik"
  const filename = originalResume?.filename || '';
  const rawName = filename.replace(/\.(pdf|docx)$/i, '').replace(/[-_]/g, ' ').replace(/resume/i, '').trim();
  const candidateName = rawName.length > 2 && rawName.length < 50
    ? rawName.replace(/([a-z])([A-Z])/g, '$1 $2').trim()
    : 'Your Name';

  // Build experience HTML from AI-improved bullets
  let experienceHtml = '';
  if (experienceBullets.length > 0) {
    experienceHtml = experienceBullets.map(b => {
      if (typeof b === 'string') return `<li>${b}</li>`;
      if (b.improved) {
        return `<li>${b.improved}</li>`;
      }
      if (b.bullets) {
        return b.bullets.map(bl => `<li>${bl}</li>`).join('');
      }
      return '';
    }).filter(Boolean).join('');
  }

  // Skills HTML - clean pills, no sparkles
  const skillsHtml = allSkills.map(s => 
    `<span class="skill-pill">${s}</span>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${candidateName} - ${jobTitle}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', -apple-system, sans-serif; background: #fff; padding: 0; line-height: 1.5; color: ${t.bodyText}; }
.page { max-width: 800px; margin: 0 auto; }

/* Header */
.header { background: ${t.headerBg}; color: ${t.headerText}; padding: 40px 48px 32px; }
.name { font-size: 32px; font-weight: 800; margin-bottom: 4px; letter-spacing: -0.5px; }
.role { font-size: 15px; font-weight: 500; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.5px; }

/* Body */
.body { padding: 32px 48px 40px; }
.section { margin-bottom: 28px; }
.section:last-child { margin-bottom: 0; }
.section-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: ${t.sectionColor}; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid ${t.accentColor}30; }

/* Summary */
.summary { font-size: 14px; line-height: 1.7; color: ${t.bodyText}; }

/* Skills */
.skills-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.skill-pill { padding: 5px 14px; border-radius: 4px; font-size: 12px; font-weight: 600; background: ${t.accentColor}12; color: ${t.accentColor}; border: 1px solid ${t.accentColor}35; }

/* Experience */
.exp-list { padding-left: 20px; }
.exp-list li { font-size: 13.5px; line-height: 1.7; margin-bottom: 8px; color: ${t.bodyText}; }

@media print {
  body { background: white; }
  .page { box-shadow: none; max-width: none; }
  .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="name">${candidateName}</div>
    <div class="role">${jobTitle}</div>
  </div>
  <div class="body">
    ${summary ? `<div class="section"><div class="section-title">Professional Summary</div><p class="summary">${summary}</p></div>` : ''}
    
    <div class="section">
      <div class="section-title">Skills</div>
      <div class="skills-grid">${skillsHtml}</div>
    </div>

    ${experienceHtml ? `<div class="section"><div class="section-title">Experience</div><ul class="exp-list">${experienceHtml}</ul></div>` : ''}
  </div>
</div>
</body>
</html>`;
}

// ─── Template Card ───────────────────────────────────────────────────────────
function TemplateMockup({ template, selected, onSelect }) {
  const t = template;
  return (
    <button
      className={`tpicker-card ${selected ? 'tpicker-card--active' : ''}`}
      onClick={() => onSelect(t.id)}
      style={{ '--tmpl-accent': t.accentColor }}
    >
      {selected && <div className="tpicker-card__check">✓</div>}
      <div className="tpicker-mock">
        <div className="tpicker-mock__header" style={{ background: t.headerBg, padding: '10px 10px 8px' }}>
          <div style={{ height: 8, borderRadius: 2, background: 'rgba(255,255,255,0.8)', width: '65%', marginBottom: 5 }} />
          <div style={{ height: 5, borderRadius: 2, background: 'rgba(255,255,255,0.4)', width: '40%' }} />
        </div>
        <div className="tpicker-mock__body" style={{ background: t.bodyBg }}>
          <div style={{ height: 4, borderRadius: 2, background: t.accentColor + '60', width: '30%', marginBottom: 7 }} />
          <div style={{ height: 4, borderRadius: 2, background: '#e5e7eb', width: '90%', marginBottom: 4 }} />
          <div style={{ height: 4, borderRadius: 2, background: '#e5e7eb', width: '75%', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[40, 55, 35, 48].map((w, i) => (
              <div key={i} style={{ height: 12, borderRadius: 3, background: t.accentColor + '28', width: w }} />
            ))}
          </div>
        </div>
      </div>
      <div className="tpicker-card__info">
        <h3>{t.name}</h3>
      </div>
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
const TemplatePickerModal = ({ tailoredResult, jobTitle, originalResume, onClose }) => {
  const preSelected = tailoredResult?.selectedTemplate || 'modern-blue';
  const [selectedId, setSelectedId] = useState(preSelected);
  const [showPreview, setShowPreview] = useState(true);
  const [previewHtml, setPreviewHtml] = useState('');

  const selectedTemplate = RESUME_TEMPLATES.find(t => t.id === selectedId);

  const rebuildPreview = useCallback(() => {
    if (!selectedTemplate) return;
    setPreviewHtml(buildResumeHtml(selectedTemplate, tailoredResult, jobTitle, originalResume));
  }, [selectedId, tailoredResult, jobTitle, originalResume]);

  useEffect(() => { rebuildPreview(); }, [rebuildPreview]);

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
    const safeName = (jobTitle || 'resume').replace(/[^a-zA-Z0-9]/g, '_');
    a.download = `${safeName}_tailored_resume.html`;
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
    <div className="tpicker-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`tpicker-modal ${showPreview ? 'tpicker-modal--wide' : ''}`}>
        
        <div className="tpicker-header">
          <div className="tpicker-header__left">
            {showPreview && (
              <button className="tpicker-back" onClick={() => setShowPreview(false)}>← Templates</button>
            )}
            <div>
              <h2 className="tpicker-title">
                {showPreview ? 'Your Tailored Resume' : 'Choose Template'}
              </h2>
              <p className="tpicker-subtitle">
                {showPreview
                  ? 'Print this page or save as PDF using your browser.'
                  : `Pick a design for your "${jobTitle}" resume.`}
              </p>
            </div>
          </div>
          <button className="tpicker-close" onClick={onClose}>✕</button>
        </div>

        {!showPreview && (
          <>
            <div className="tpicker-body">
              <div className="tpicker-grid">
                {RESUME_TEMPLATES.map(t => (
                  <TemplateMockup key={t.id} template={t} selected={selectedId === t.id} onSelect={setSelectedId} />
                ))}
              </div>
            </div>
            <div className="tpicker-actions">
              <button className="tpicker-btn-ghost" onClick={onClose}>Cancel</button>
              <button className="tpicker-btn-primary" onClick={() => setShowPreview(true)}>Preview Resume</button>
            </div>
          </>
        )}

        {showPreview && (
          <div className="tpicker-preview-wrap">
            <div className="tpicker-preview-toolbar">
              <span className="tpicker-preview-badge">{selectedTemplate?.name}</span>
              <div className="tpicker-preview-btns">
                <button className="tpicker-btn-ghost" onClick={handlePrint}>Print / Save PDF</button>
                <button className="tpicker-btn-primary" onClick={handleDownload}>Download HTML</button>
              </div>
            </div>
            <div className="tpicker-iframe-wrap">
              {previewHtml && (
                <iframe id="tpicker-preview-frame" className="tpicker-iframe" srcDoc={previewHtml} title="Resume Preview" sandbox="allow-same-origin allow-modals" />
              )}
            </div>
            <div className="tpicker-download-note">
              To save as PDF: Click "Print / Save PDF" → choose "Save as PDF" as destination.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplatePickerModal;
