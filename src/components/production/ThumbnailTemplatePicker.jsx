import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, ChevronRight, Zap, Eye, X, Info, Star, Upload, Trash2 } from 'lucide-react';
import { THUMBNAIL_TEMPLATES, TEMPLATE_GROUPS, recommendTemplates } from './thumbnailTemplates';
import { TEMPLATE_IMAGES } from './thumbnailReferenceImages';

// Helper — get image src: custom dataUrl > base64 library > /uploads/ path
function getImgSrc(template) {
  if (template.customDataUrl) return template.customDataUrl;
  const b64 = TEMPLATE_IMAGES[template.id];
  if (b64?.dataUrl) return b64.dataUrl;
  return `/uploads/${template.previewImageFile}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CTR badge color
// ─────────────────────────────────────────────────────────────────────────────
const ctrColor = score =>
  score >= 9.5 ? '#22c55e' : score >= 9.0 ? '#86efac' : score >= 8.5 ? '#f59e0b' : '#9ca3af';

// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW MODAL — full-size reference image + deep psychology breakdown
// ─────────────────────────────────────────────────────────────────────────────
function PreviewModal({ template, onClose, onSelect, isSelected }) {
  if (!template) return null;
  const gc = TEMPLATE_GROUPS.find(g => g.id === template.groupLabel);
  const groupColor = gc?.color || '#7c3aed';
  const groupTextColor = gc?.textColor || '#000';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.95)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px', backdropFilter: 'blur(10px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0b0b1a',
          borderRadius: 18,
          border: `2px solid ${groupColor}50`,
          maxWidth: 860, width: '100%',
          maxHeight: '92vh', overflow: 'auto',
          boxShadow: `0 0 60px ${groupColor}30`,
        }}
      >
        {/* Reference image — full size */}
        <div style={{ position: 'relative' }}>
          <img
            src={getImgSrc(template)}
            alt={template.name}
            style={{ width: '100%', display: 'block', borderRadius: '16px 16px 0 0', aspectRatio: '16/9', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none'; }}
          />
          {/* Close */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 12, right: 12,
              background: 'rgba(0,0,0,0.85)', border: 'none', borderRadius: 8,
              color: '#fff', cursor: 'pointer', padding: '7px 13px',
              fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5,
              backdropFilter: 'blur(4px)',
            }}
          >
            <X size={13} /> Close
          </button>
          {/* CTR badge on image */}
          <div style={{
            position: 'absolute', bottom: 12, right: 12,
            background: ctrColor(template.ctrScore), borderRadius: 8,
            padding: '5px 10px', fontWeight: 800, fontSize: 13, color: '#fff',
          }}>
            ⭐ {template.ctrScore} / 10 CTR
          </div>
          {/* Group badge */}
          <div style={{
            position: 'absolute', top: 12, left: 12,
            background: groupColor, borderRadius: 8,
            padding: '4px 10px', fontWeight: 700, fontSize: 11, color: groupTextColor,
          }}>
            {gc?.label || template.groupLabel}
          </div>
        </div>

        <div style={{ padding: '22px 28px 28px' }}>
          {/* Title row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#fff' }}>{template.name}</h2>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>{template.genre}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
              <span style={{ background: '#1f2937', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#9ca3af' }}>
                👥 {template.charCount} char{template.charCount > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Psychology */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
              🧠 Why This Stops the Scroll
            </div>
            <div style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.65, background: '#111827', borderRadius: 10, padding: '12px 16px', borderLeft: `3px solid ${groupColor}` }}>
              {template.psychology}
            </div>
          </div>

          {/* Text Strategy */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
              ✍️ Text Strategy
            </div>
            <div style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.6, background: `${groupColor}12`, borderRadius: 10, padding: '12px 16px', border: `1px solid ${groupColor}25` }}>
              {template.textStrategy}
            </div>
          </div>

          {/* Beast Formula breakdown */}
          {template.beast_formula && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                ⚡ Beast Formula Breakdown
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {Object.entries(template.beast_formula).map(([key, val]) => (
                  <div key={key} style={{ background: '#111827', borderRadius: 7, padding: '8px 10px', fontSize: 11 }}>
                    <div style={{ color: '#f59e0b', fontWeight: 700, textTransform: 'capitalize', marginBottom: 2 }}>
                      {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
                    </div>
                    <div style={{ color: '#6b7280', lineHeight: 1.4 }}>{String(val)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reference description */}
          <div style={{ background: '#111827', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 11, color: '#4b5563' }}>
            <span style={{ color: '#374151', fontWeight: 700 }}>Original: </span>{template.referenceDescription}
          </div>

          {/* Select / deselect button */}
          <button
            onClick={() => { onSelect(template); onClose(); }}
            style={{
              width: '100%', padding: '14px', borderRadius: 12, border: 'none',
              background: isSelected
                ? 'linear-gradient(135deg, #374151, #1f2937)'
                : `linear-gradient(135deg, ${groupColor}, ${groupColor}cc)`,
              color: isSelected ? '#9ca3af' : groupTextColor,
              cursor: 'pointer', fontWeight: 800, fontSize: 15,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {isSelected
              ? <><X size={16} /> Deselect Template</>
              : <><Zap size={16} /> Use This Template — AI Will Recreate It With Your Content</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE CARD
// ─────────────────────────────────────────────────────────────────────────────
function TemplateCard({ template, isSelected, onSelect, onPreview, onDelete }) {
  const [imgError, setImgError] = useState(false);
  const [hovered, setHovered] = useState(false);
  const gc = TEMPLATE_GROUPS.find(g => g.id === template.groupLabel);
  const groupColor = gc?.color || '#7c3aed';
  const groupTextColor = gc?.textColor || '#fff';

  return (
    <div
      onClick={() => onSelect(isSelected ? null : template)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: isSelected
          ? `2px solid ${groupColor}`
          : hovered ? `2px solid ${groupColor}60` : '2px solid #1f2937',
        borderRadius: 14,
        background: isSelected ? `${groupColor}12` : '#0b0b1a',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        overflow: 'hidden',
        boxShadow: isSelected ? `0 0 24px ${groupColor}35` : hovered ? '0 4px 16px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.3)',
        transform: hovered && !isSelected ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* ── Reference thumbnail image ── */}
      <div style={{ position: 'relative', aspectRatio: '16/9', background: '#070711', overflow: 'hidden' }}>
        {!imgError ? (
          <img
            src={getImgSrc(template)}
            alt={template.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.3s', transform: hovered ? 'scale(1.04)' : 'scale(1)' }}
            onError={() => setImgError(true)}
          />
        ) : (
          // Fallback gradient when image fails to load
          <div style={{
            width: '100%', height: '100%',
            background: `linear-gradient(135deg, ${groupColor}30 0%, #0b0b1a 100%)`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <div style={{ fontSize: 32 }}>🎨</div>
            <div style={{ fontSize: 11, color: '#374151', textAlign: 'center', padding: '0 16px', lineHeight: 1.4 }}>{template.name}</div>
          </div>
        )}

        {/* Group badge — top left */}
        <div style={{
          position: 'absolute', top: 8, left: 8,
          background: groupColor, borderRadius: 6,
          padding: '2px 8px', fontSize: 9, fontWeight: 800,
          color: groupTextColor, backdropFilter: 'blur(4px)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          {template.groupLabel}
        </div>

        {/* CTR badge — top right */}
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: ctrColor(template.ctrScore),
          borderRadius: 6, padding: '2px 7px',
          fontSize: 10, fontWeight: 800, color: '#fff',
        }}>
          ⭐ {template.ctrScore}
        </div>

        {/* Preview button — appears on hover */}
        {hovered && (
          <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 4 }}>
            {onDelete && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(template.id); }}
                style={{
                  background: 'rgba(239,68,68,0.85)', border: 'none',
                  borderRadius: 6, padding: '5px 8px', color: '#fff',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 3,
                  backdropFilter: 'blur(6px)',
                }}
              >
                <Trash2 size={11} />
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); onPreview(template); }}
              style={{
                background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 6, padding: '5px 10px', color: '#fff',
                cursor: 'pointer', fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4,
                backdropFilter: 'blur(6px)',
              }}
            >
              <Eye size={11} /> Full Preview
            </button>
          </div>
        )}

        {/* Selected checkmark overlay */}
        {isSelected && (
          <div style={{
            position: 'absolute', inset: 0,
            background: `${groupColor}20`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{
              background: groupColor, borderRadius: '50%',
              width: 40, height: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 20px ${groupColor}80`,
            }}>
              <CheckCircle size={22} color={groupTextColor} />
            </div>
          </div>
        )}
      </div>

      {/* ── Info section ── */}
      <div style={{ padding: '12px 14px 14px' }}>
        {/* Name */}
        <div style={{ fontWeight: 800, fontSize: 13, color: '#fff', marginBottom: 5, lineHeight: 1.3 }}>
          {template.name}
        </div>

        {/* Psychology snippet */}
        <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.45, marginBottom: 10 }}>
          {template.psychology.split('.')[0]}.
        </div>

        {/* Text strategy chip */}
        <div style={{
          background: '#111827',
          borderRadius: 6, padding: '5px 9px',
          fontSize: 10, color: '#6b7280', lineHeight: 1.4,
          marginBottom: 10,
          borderLeft: `2px solid ${groupColor}`,
        }}>
          <span style={{ color: groupColor, fontWeight: 700 }}>TEXT: </span>
          {template.textStrategy.substring(0, 65)}…
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ background: '#111827', borderRadius: 5, padding: '2px 7px', fontSize: 9, color: '#6b7280', fontWeight: 600 }}>
            👥 {template.charCount} CHAR{template.charCount > 1 ? 'S' : ''}
          </span>
          <span style={{ background: '#111827', borderRadius: 5, padding: '2px 7px', fontSize: 9, color: '#6b7280', fontWeight: 600 }}>
            {template.genre.toUpperCase()}
          </span>
        </div>

        {/* Buttons row */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={e => { e.stopPropagation(); onPreview(template); }}
            style={{
              flex: '0 0 auto',
              padding: '8px 10px', borderRadius: 7,
              border: '1px solid #1f2937',
              background: 'none', color: '#4b5563',
              cursor: 'pointer', fontSize: 11,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Info size={11} /> Details
          </button>
          <button
            onClick={e => { e.stopPropagation(); onSelect(isSelected ? null : template); }}
            style={{
              flex: 1,
              padding: '8px', borderRadius: 7,
              border: 'none',
              background: isSelected
                ? `${groupColor}` : '#1f2937',
              color: isSelected ? groupTextColor : '#9ca3af',
              cursor: 'pointer', fontWeight: 700, fontSize: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              transition: 'all 0.15s',
            }}
          >
            {isSelected
              ? <><CheckCircle size={11} /> Selected</>
              : <>Select <ChevronRight size={11} /></>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT: ThumbnailTemplatePicker
//
// Props:
//   selectedTemplate  — currently selected template object or null
//   onSelect(t|null)  — called with template when selected, or null when deselected
//   title             — current video title (used for AI recommendations)
//   summary           — optional summary (used for AI recommendations)
// ─────────────────────────────────────────────────────────────────────────────
export default function ThumbnailTemplatePicker({ selectedTemplate, onSelect, title = '', summary = '' }) {
  const [activeGroup, setActiveGroup] = useState('all');
  const [sortBy, setSortBy]           = useState('recommended');
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [customTemplates, setCustomTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('custom_thumb_templates') || '[]'); } catch (_) { return []; }
  });
  const uploadRef = useRef(null);

  // Persist custom templates
  useEffect(() => {
    localStorage.setItem('custom_thumb_templates', JSON.stringify(customTemplates));
  }, [customTemplates]);

  const handleCustomUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const b64 = dataUrl.split(',')[1];
      const mime = file.type || 'image/jpeg';
      const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      const newTpl = {
        id,
        name: file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').substring(0, 40) || 'Custom Template',
        genre: 'Custom Upload',
        groupLabel: 'Custom',
        psychology: 'User-uploaded reference template. AI will recreate this exact layout with your characters and overlay text.',
        primaryColor: '#7c3aed',
        textStrategy: 'AI will determine optimal text placement based on the template layout.',
        beast_formula: null,
        imagePromptInstructions: 'Recreate this exact thumbnail layout, composition, background, lighting, and style.',
        referenceDescription: 'User-uploaded custom template reference.',
        ctrScore: 8.0,
        charCount: 2,
        bestFor: [],
        signals: [],
        isCustom: true,
        customDataUrl: dataUrl,
        customB64: b64,
        customMime: mime,
      };
      setCustomTemplates(prev => [newTpl, ...prev]);
      onSelect(newTpl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeleteCustom = (id) => {
    setCustomTemplates(prev => prev.filter(t => t.id !== id));
    if (selectedTemplate?.id === id) onSelect(null);
  };

  // Recompute recommendations whenever title/summary changes
  useEffect(() => {
    const recs = recommendTemplates(title, summary, 4);
    setRecommendations(recs);
    // Auto-switch sort to recommended when we have recs
    if (recs.length > 0) setSortBy('recommended');
  }, [title, summary]);

  // Merge built-in + custom templates
  const allTemplates = [...customTemplates, ...THUMBNAIL_TEMPLATES];

  // Filter
  const filtered = allTemplates.filter(t =>
    activeGroup === 'all' || t.groupLabel === activeGroup
  );

  // Sort
  const recIds = new Set(recommendations.map(r => r.id));
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'recommended') {
      const aRec = recIds.has(a.id) ? 1 : 0;
      const bRec = recIds.has(b.id) ? 1 : 0;
      if (bRec !== aRec) return bRec - aRec;
    }
    if (sortBy === 'ctr') return b.ctrScore - a.ctrScore;
    return 0;
  });

  const totalCount = allTemplates.length;

  return (
    <div>
      {/* ── Preview modal ── */}
      {previewTemplate && (
        <PreviewModal
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          onSelect={t => { onSelect(t); setPreviewTemplate(null); }}
          isSelected={selectedTemplate?.id === previewTemplate?.id}
        />
      )}

      {/* ── AI Recommendation Banner ── */}
      {recommendations.length > 0 && title.trim() && (
        <div style={{
          background: 'rgba(124,58,237,0.1)',
          border: '1px solid rgba(124,58,237,0.25)',
          borderRadius: 12, padding: '12px 16px', marginBottom: 16,
          display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
            <Zap size={14} color="#a78bfa" />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa' }}>
              AI recommends for "{title.substring(0, 45)}{title.length > 45 ? '…' : ''}"
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {recommendations.map(t => {
              const gc = TEMPLATE_GROUPS.find(g => g.id === t.groupLabel);
              const isSelected = selectedTemplate?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => onSelect(isSelected ? null : t)}
                  style={{
                    padding: '5px 12px', borderRadius: 20,
                    border: `1px solid ${isSelected ? gc?.color || '#7c3aed' : 'rgba(124,58,237,0.3)'}`,
                    background: isSelected ? gc?.color || '#7c3aed' : 'rgba(124,58,237,0.12)',
                    color: isSelected ? gc?.textColor || '#fff' : '#a78bfa',
                    cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {isSelected && <CheckCircle size={10} />}
                  {t.name}
                  <span style={{ opacity: 0.7 }}>⭐{t.ctrScore}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Selected template summary ── */}
      {selectedTemplate && (
        <div style={{
          background: `${(selectedTemplate.isCustom ? '#7c3aed' : TEMPLATE_GROUPS.find(g => g.id === selectedTemplate.groupLabel)?.color) || '#7c3aed'}15`,
          border: `1px solid ${(selectedTemplate.isCustom ? '#7c3aed' : TEMPLATE_GROUPS.find(g => g.id === selectedTemplate.groupLabel)?.color) || '#7c3aed'}40`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <CheckCircle size={15} color="#22c55e" />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{selectedTemplate.name}</span>
            <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>{selectedTemplate.genre}</span>
          </div>
          <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>
            ⭐ {selectedTemplate.ctrScore}/10 CTR
          </div>
          <button
            onClick={() => onSelect(null)}
            style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 4 }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Filter / Sort bar ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Group filters */}
        <button
          onClick={() => setActiveGroup('all')}
          style={{
            padding: '6px 14px', borderRadius: 20, border: 'none',
            background: activeGroup === 'all' ? '#7c3aed' : '#1f2937',
            color: activeGroup === 'all' ? '#fff' : '#6b7280',
            cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
          }}
        >
          All ({totalCount})
        </button>

        {customTemplates.length > 0 && (
          <button
            onClick={() => setActiveGroup('Custom')}
            style={{
              padding: '6px 14px', borderRadius: 20, border: 'none',
              background: activeGroup === 'Custom' ? '#7c3aed' : '#1f2937',
              color: activeGroup === 'Custom' ? '#fff' : '#6b7280',
              cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
            }}
          >
            📁 My Templates ({customTemplates.length})
          </button>
        )}

        {TEMPLATE_GROUPS.map(g => {
          const count = allTemplates.filter(t => t.groupLabel === g.id).length;
          const isActive = activeGroup === g.id;
          return (
            <button
              key={g.id}
              onClick={() => setActiveGroup(g.id)}
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none',
                background: isActive ? g.color : '#1f2937',
                color: isActive ? g.textColor : '#6b7280',
                cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
              }}
            >
              {g.label} ({count})
            </button>
          );
        })}

        {/* Sort — right aligned */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 5, background: '#111827', borderRadius: 8, padding: 3 }}>
          {[['recommended', '✨ Recommended'], ['ctr', '⭐ Top CTR']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setSortBy(val)}
              style={{
                padding: '5px 11px', borderRadius: 6, border: 'none',
                background: sortBy === val ? '#374151' : 'transparent',
                color: sortBy === val ? '#fff' : '#4b5563',
                cursor: 'pointer', fontSize: 11, fontWeight: 600,
                transition: 'all 0.1s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Template Grid ── */}
      <input ref={uploadRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCustomUpload} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 14,
      }}>
        {/* Upload custom template card */}
        <div
          onClick={() => uploadRef.current?.click()}
          style={{
            border: '2px dashed #374151', borderRadius: 14, background: '#0b0b1a',
            cursor: 'pointer', transition: 'all 0.15s ease', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            minHeight: 280, gap: 12,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.background = 'rgba(124,58,237,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#374151'; e.currentTarget.style.background = '#0b0b1a'; }}
        >
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Upload size={22} color="#7c3aed" />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#a78bfa' }}>Upload Template</div>
          <div style={{ fontSize: 11, color: '#4b5563', textAlign: 'center', padding: '0 20px', lineHeight: 1.5 }}>
            Upload any YouTube thumbnail as a reference — AI will recreate its exact layout
          </div>
        </div>

        {sorted.map(template => (
          <TemplateCard
            key={template.id}
            template={template}
            isSelected={selectedTemplate?.id === template.id}
            onSelect={onSelect}
            onPreview={setPreviewTemplate}
            onDelete={template.isCustom ? handleDeleteCustom : null}
          />
        ))}
      </div>

      {sorted.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#374151' }}>
          No templates in this category.
        </div>
      )}

      {/* Footer note */}
      <div style={{ marginTop: 14, fontSize: 11, color: '#374151', textAlign: 'center' }}>
        AI will recreate the selected layout verbatim — your characters, title and overlay text will be composited into the exact same composition
      </div>
    </div>
  );
}