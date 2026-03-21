import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import {
  ArrowLeft, Upload, X, Sparkles, Loader2, Download,
  RefreshCw, Wand2, Users, Star, ChevronRight, Image as ImageIcon,
  CheckCircle, AlertCircle, Eye, Zap, Target, Palette, PenLine
} from 'lucide-react';
import ThumbnailTemplatePicker from './ThumbnailTemplatePicker';
import { buildTemplatePrompt } from './thumbnailTemplates';
import { TEMPLATE_IMAGES } from './thumbnailReferenceImages';

// ═══════════════════════════════════════════════════════════════════════
// MOOD ENGINE — maps title+summary → visual DNA
// ═══════════════════════════════════════════════════════════════════════
const MOODS = {
  // Default fallback — actual mood comes dynamically from Gemini
  default: {
    label: 'Dynamic', emoji: '🎯',
    bg: ['#0d0d1a','#16213e','#0f3460'], accent: '#7c3aed', accent2: '#fff',
    textColor: '#fff', badgeBg: '#7c3aed',
    titleFont: '"Arial Black", Impact, sans-serif',
    titleShadow: '3px 3px 0 #000, 0 0 20px rgba(124,58,237,0.7)',
    overlayFilter: 'saturate(130%) contrast(115%)',
    vignetteStrength: 0.6,
    bgStyle: 'linear-gradient(135deg, #0d0d1a 0%, #16213e 50%, #0f3460 100%)',
    textStroke: '2px', ctrBase: 8.5,
  },
};

// Mood is now detected dynamically by Gemini — no hardcoded keyword matching
function detectMood() {
  return 'default';
}

// ═══════════════════════════════════════════════════════════════════════
// CHARACTER UPLOAD SLOT
// ═══════════════════════════════════════════════════════════════════════
function CharSlot({ index, label, char, onUpload, onRemove, onDescriptionChange }) {
  const ref = useRef(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        onClick={() => !char && ref.current?.click()}
        style={{
          border: char ? '2px solid #7c3aed' : '2px dashed #374151',
          borderRadius: 12, overflow: 'hidden', aspectRatio: '3/4',
          background: char ? '#000' : '#0f172a', cursor: char ? 'default' : 'pointer',
          position: 'relative', transition: 'border-color 0.2s',
        }}
      >
        <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(index, f); }} />
        {char ? (
          <>
            <img src={char.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button onClick={e => { e.stopPropagation(); onRemove(index); }}
              style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.75)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={13} />
            </button>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.9),transparent)', padding: '18px 8px 6px', fontSize: 11, color: '#ccc', textAlign: 'center' }}>
              {label}
            </div>
          </>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#4b5563' }}>
            <Upload size={24} />
            <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.4 }}>
              <div style={{ color: '#6b7280', fontWeight: 600 }}>{label}</div>
              <div style={{ color: '#374151', fontSize: 10 }}>Click to upload</div>
            </div>
          </div>
        )}
      </div>
      {char && (
        <input
          value={char.description || ''}
          onChange={e => onDescriptionChange(index, e.target.value)}
          placeholder="Outfit/look (optional)"
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', padding: '6px 8px', background: '#0f172a',
            border: '1px solid #1f2937', borderRadius: 6, color: '#d1d5db',
            fontSize: 10, outline: 'none', boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STEP INDICATOR
// ═══════════════════════════════════════════════════════════════════════
function StepDots({ current, total }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          width: i === current ? 24 : 8, height: 8, borderRadius: 4,
          background: i === current ? '#7c3aed' : i < current ? '#4c1d95' : '#1f2937',
          transition: 'all 0.3s',
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// OVERLAY TEXT CARD — user picks one of 5 AI-generated overlay texts
// ═══════════════════════════════════════════════════════════════════════
function OverlayTextCard({ concept, isSelected, onSelect }) {
  const ctr = concept.ctr_score || 7;
  const ctrColor = ctr >= 9 ? '#22c55e' : ctr >= 7 ? '#f59e0b' : '#9ca3af';
  const emotionColors = {
    FEAR: '#ef4444', GREED: '#22c55e', SHOCK: '#f59e0b', CURIOSITY: '#8b5cf6',
  };
  const emotion = (concept.psychological_trigger || concept.concept_type || '').toUpperCase();
  const emotionColor = emotionColors[emotion] || '#6b7280';

  return (
    <div
      onClick={() => onSelect(concept)}
      style={{
        border: isSelected ? '2px solid #7c3aed' : '2px solid #1f2937',
        borderRadius: 12, background: isSelected ? 'rgba(124,58,237,0.15)' : '#0b0b1a',
        cursor: 'pointer', transition: 'border 0.15s, background 0.15s, box-shadow 0.15s',
        overflow: 'hidden', padding: '16px 18px',
        boxShadow: isSelected ? '0 0 24px rgba(124,58,237,0.35)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            background: 'rgba(0,0,0,0.8)', borderRadius: 6, padding: '2px 8px',
            fontSize: 11, fontWeight: 700, color: '#fff',
          }}>#{concept.rank || 1}</div>
          {emotion && (
            <div style={{
              fontSize: 10, fontWeight: 800, color: emotionColor, background: `${emotionColor}18`,
              borderRadius: 4, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>{emotion}</div>
          )}
        </div>
        <div style={{ background: ctrColor, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#fff' }}>
          ⭐ {ctr}/10
        </div>
      </div>

      {/* The overlay text — star of the show */}
      {concept.text_overlay && (
        <div style={{
          fontFamily: 'Impact, Arial Black', fontWeight: 900,
          fontSize: 26, color: '#fff', letterSpacing: '0.04em',
          marginBottom: 10, lineHeight: 1.1, textAlign: 'center',
          textShadow: '2px 2px 0 #000, 0 0 20px rgba(255,255,255,0.15)',
          padding: '12px 0',
        }}>
          {concept.text_overlay}
        </div>
      )}

      {/* Why it works */}
      <div style={{ color: '#6b7280', fontSize: 11, lineHeight: 1.45 }}>
        {(concept.why_it_stops_scrolling || concept.concept_description || '').substring(0, 120)}…
      </div>

      {isSelected && (
        <div style={{ marginTop: 10, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#a78bfa' }}>
          ✓ Selected — this text will be rendered on your thumbnail
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// FLOW:
//   Step 0 — Title + summary + character photos (2-3, required) + template (required)
//   Step 1 — Gemini engineers 5 high-CTR overlay texts → user picks one
//   Step 2 — Ideogram character-remix renders: template + photos + selected text
//   Step 3 — Result: download, re-render, try other texts
// ═══════════════════════════════════════════════════════════════════════
export default function MakeThumbnail({ onBack, initialTitle, initialSummary, sceneImages, projectId, selectedSeoTitles = [] }) {
  const [step, setStep] = useState(0);

  // Step 0 inputs
  const [title, setTitle]       = useState(initialTitle || '');
  const [summary, setSummary]   = useState(initialSummary || '');
  const [chars, setChars]       = useState([null]); // start with 1 slot, can grow to 14

  // Sync props when they change (e.g. summary loaded async)
  useEffect(() => { if (initialTitle && !title) setTitle(initialTitle); }, [initialTitle]);
  useEffect(() => { if (initialSummary && !summary) setSummary(initialSummary); }, [initialSummary]);
  const [selectedUserTemplate, setSelectedUserTemplate] = useState(null);

  // Step 1 data
  const [loadingConcepts, setLoadingConcepts] = useState(false);
  const [loadingPhase, setLoadingPhase]       = useState('');
  const [concepts, setConcepts]               = useState([]);
  const [selectedConcept, setSelectedConcept] = useState(null);
  const [templateMeta, setTemplateMeta]       = useState(null);
  const [detectedMood, setDetectedMood]       = useState(null);
  const [customOverlay, setCustomOverlay]     = useState('');
  const [useCustomOverlay, setUseCustomOverlay] = useState(false);

  // Step 2/3 data
  const [generating, setGenerating]     = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState(null);
  const [error, setError]               = useState(null);

  // ── helpers ──────────────────────────────────────────────────────
  const MAX_PHOTOS = 14; // nano-banana-2 supports up to 14 image inputs
  const handleUpload = (i, file) => {
    const url = URL.createObjectURL(file);
    setChars(prev => { const a = [...prev]; a[i] = { file, url, name: file.name, description: '' }; return a; });
  };
  const handleDescriptionChange = (i, desc) => {
    setChars(prev => { const a = [...prev]; if (a[i]) a[i] = { ...a[i], description: desc }; return a; });
  };
  const handleRemove = i => {
    // Remove the slot entirely (unless it would go below 2 slots)
    setChars(prev => {
      const a = [...prev];
      a.splice(i, 1);
      while (a.length < 1) a.push(null); // keep minimum 1 slot
      return a;
    });
  };
  const handleAddSlot = () => {
    if (chars.length < MAX_PHOTOS) {
      setChars(prev => [...prev, null]);
    }
  };

  // ── Validation: all required fields ──────────────────────────────
  const uploadedChars = chars.filter(Boolean);
  const canSubmit = title.trim() && summary.trim() && uploadedChars.length >= 1 && selectedUserTemplate;

  // ── Poll helper for pending KIE tasks ─────────────────────────
  const pollForTaskResult = async (taskId, conceptId) => {
    const maxAttempts = 40; // 40 × 5s = 200s max
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await base44.functions.invoke('pollThumbnailTask', { task_id: taskId, concept_id: conceptId });
        const data = res?.data ?? res;
        if (data?.completed) {
          if (data?.image_url) return { image_url: data.image_url };
          return { error: data?.error || 'Generation failed' };
        }
        console.log(`Frontend poll ${i + 1}/${maxAttempts}: ${data?.state || 'waiting'}`);
      } catch (e) {
        console.warn('Poll error:', e.message);
      }
    }
    return { error: 'Generation timed out after extended polling.' };
  };

  // ── Step 0 → 1: Generate 5 overlay text concepts ──────────────
  const handleGenerateConcepts = async () => {
    if (!canSubmit) return;
    setLoadingConcepts(true);
    setError(null);
    setConcepts([]);
    setSelectedConcept(null);
    setGeneratedUrl(null);
    setStep(1);

    try {
      setLoadingPhase('Preparing your character photos…');
      const charPhotos = [];
      for (const char of chars.filter(Boolean)) {
        if (char?.file) {
          try {
            const b64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result.split(',')[1]);
              reader.onerror = reject;
              reader.readAsDataURL(char.file);
            });
            charPhotos.push({ b64, mime: char.file.type || 'image/jpeg', name: char.name || 'character' });
          } catch (_) {}
        } else if (char?.remoteUrl) {
          // Scene image from URL — pass URL directly, backend will handle it
          charPhotos.push({ url: char.remoteUrl, name: char.name || 'scene' });
        }
      }

      // Build template context if user picked one
      const templateB64 = selectedUserTemplate?.customB64 || TEMPLATE_IMAGES[selectedUserTemplate?.id]?.b64 || null;
      const templateMime = selectedUserTemplate?.customMime || TEMPLATE_IMAGES[selectedUserTemplate?.id]?.mime || null;
      const templateContext = selectedUserTemplate ? {
        template_id:             selectedUserTemplate.id,
        template_name:           selectedUserTemplate.name,
        template_psychology:     selectedUserTemplate.psychology,
        template_text_strategy:  selectedUserTemplate.textStrategy,
        template_ctr:            selectedUserTemplate.ctrScore,
        template_b64:            templateB64,
        template_mime:           templateMime,
      } : {};

      setLoadingPhase('Gemini is engineering your 5 high-CTR concepts…');

      let conceptsResult;
      try {
        conceptsResult = await base44.functions.invoke('newThumbnailConcept', {
          video_title:  title.trim(),
          summary:      summary.trim() || '',
          char_count:   uploadedChars.length,
          char_photos:  charPhotos,
          project_id:   projectId || undefined,
          seo_titles:   selectedSeoTitles.length > 0 ? selectedSeoTitles.map(t => t.title) : undefined,
          ...templateContext,
        });
      } catch (e) {
        throw new Error(`newThumbnailConcept error: ${e.message}`);
      }

      const result = conceptsResult?.data ?? conceptsResult;
      if (result?.error) throw new Error(result.error);

      const conceptIds = result?.concept_ids || result?.data?.concept_ids || [];
      if (!conceptIds.length) {
        console.error('Raw response:', JSON.stringify(conceptsResult));
        throw new Error('No concept_ids returned. Check function logs.');
      }

      // Store metadata
      if (result?.template_selection) setTemplateMeta(result.template_selection);
      if (result?.detected_mood) setDetectedMood(result.detected_mood);

      // Load saved concept records
      setLoadingPhase('Loading your 5 concepts…');
      const saved = [];
      for (const id of conceptIds) {
        try {
          const record = await base44.entities.ThumbnailConcepts.get(id);
          if (record) saved.push(record);
        } catch (_) {}
      }
      if (!saved.length) throw new Error('Concepts saved but could not be loaded.');

      const sorted = [...saved].sort((a, b) => (a.rank || 99) - (b.rank || 99));
      setConcepts(sorted);
      setSelectedConcept(sorted[0] || null);

    } catch (e) {
      console.error('handleGenerateConcepts error:', e);
      setError(e.message);
      setStep(0);
    }

    setLoadingPhase('');
    setLoadingConcepts(false);
  };

  // ── Step 1 → 2: User selected an overlay text, now render ──────
  const handleGenerateImage = async (concept) => {
    if (!concept?.id) return;
    // If custom overlay is in use, update the concept's text fields before sending
    const effectiveConcept = (useCustomOverlay && customOverlay.trim())
      ? { ...concept, text_overlay: customOverlay.trim() }
      : concept;
    setSelectedConcept(effectiveConcept);
    setGenerating(true);
    setError(null);
    setGeneratedUrl(null);
    setStep(2);

    try {
      // Resize photos to 1024px max before sending (higher res = better face reference)
      const resizeToBase64 = (file, maxDim = 1024) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
        };
        img.onerror = () => resolve(null);
        img.src = URL.createObjectURL(file);
      });

      const directCharPhotos = [];
      for (const char of chars.filter(Boolean)) {
        if (char?.file) {
          try {
            const b64 = await resizeToBase64(char.file, 512);
            if (b64) directCharPhotos.push({ b64, mime: 'image/jpeg', description: char.description || '' });
          } catch (_) {}
        } else if (char?.remoteUrl) {
          // Scene image — pass URL directly to backend (avoids CORS issues)
          directCharPhotos.push({ url: char.remoteUrl, description: char.description || '' });
        }
      }

      // Template reference — resize if too large, NEVER skip
      let directTemplate = null;
      const tplB64Source = selectedUserTemplate?.customB64 || TEMPLATE_IMAGES[selectedUserTemplate?.id]?.b64;
      const tplMimeSource = selectedUserTemplate?.customMime || TEMPLATE_IMAGES[selectedUserTemplate?.id]?.mime || 'image/jpeg';
      if (selectedUserTemplate && tplB64Source) {
        const tpl = { b64: tplB64Source, mime: tplMimeSource };
        let tplB64 = tpl.b64;

        if (tplB64.length > 250000) {
          try {
            tplB64 = await new Promise((resolve) => {
              const img = new Image();
              img.onload = () => {
                const scale = Math.min(1024 / img.width, 1024 / img.height, 1);
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
              };
              img.onerror = () => resolve(tpl.b64);
              img.src = `data:${tpl.mime || 'image/jpeg'};base64,${tpl.b64}`;
            });
            console.log('Template resized for transfer');
          } catch (_) {
            tplB64 = tpl.b64;
          }
        }

        directTemplate = { b64: tplB64, mime: tpl.mime || 'image/jpeg', name: selectedUserTemplate.name };
      }

      // Collect character descriptions
      const charDescs = chars.filter(Boolean).map(c => c.description || '');

      const raw = await base44.functions.invoke('generateNewThumbnailImage', {
        concept_id:   effectiveConcept.id,
        char_photos:  directCharPhotos.length > 0 ? directCharPhotos : undefined,
        template_ref: directTemplate || undefined,
        custom_overlay_text: (useCustomOverlay && customOverlay.trim()) ? customOverlay.trim() : undefined,
        char_descriptions: charDescs,
      });

      const result = raw?.data ?? raw;
      const imageUrl = result?.image_url || result?.data?.image_url;

      if (imageUrl) {
        setGeneratedUrl(imageUrl);
      } else if (result?.pending && result?.task_id) {
        // Generation still in progress — poll for result
        console.log('Generation pending, polling task:', result.task_id);
        const pollResult = await pollForTaskResult(result.task_id, result.concept_id);
        if (pollResult?.image_url) {
          setGeneratedUrl(pollResult.image_url);
        } else {
          throw new Error(pollResult?.error || 'Generation timed out. Please try again.');
        }
      } else if (result?.error) {
        throw new Error(result.error);
      } else {
        console.error('Raw response:', JSON.stringify(raw));
        throw new Error('No image_url in response. Check function logs.');
      }
    } catch (e) {
      console.error('handleGenerateImage error:', e);
      setError(e.message);
    }

    setGenerating(false);
    setStep(3);
  };

  const handleDownload = async () => {
    const url = generatedUrl || selectedConcept?.image_url;
    if (!url) return;
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `thumbnail-${title.replace(/\s+/g, '-').toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      window.open(url, '_blank');
    }
  };

  // detectedMood from backend can be pipe-separated (e.g. "crime|drama") — take first segment
  const resolvedMood = (detectedMood || 'default').split('|')[0].trim();
  const moodProfile = MOODS[resolvedMood] || MOODS.default;

  // ── Validation helper for missing fields ───────────────────────
  const missingFields = [];
  if (!title.trim()) missingFields.push('Video Title');
  if (!summary.trim()) missingFields.push('Video Summary');
  if (uploadedChars.length < 1) missingFields.push('At least 1 photo required');
  if (!selectedUserTemplate) missingFields.push('Reference Template');

  // ════════════════════════════════════════════════════════════════
  // STEP 0 — Setup (all fields required)
  // ════════════════════════════════════════════════════════════════
  if (step === 0) return (
    <div style={{ minHeight: '100vh', background: '#070711', color: '#fff' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1f2937', padding: '15px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ width: 1, height: 20, background: '#1f2937' }} />
        <div style={{ fontSize: 15, fontWeight: 700 }}>🎯 AI Thumbnail Maker</div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px' }}>
        <StepDots current={0} total={4} />

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 25, fontWeight: 800, marginBottom: 8 }}>Create a World-Class Thumbnail</div>
          <div style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6 }}>
            Enter your video details, upload 1–14 key photos, pick a template — AI generates 5 overlay texts, then renders a direct replica
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
            Video Title <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder='e.g. "GRANDMA EXPLODES After Finding Out The Truth!"'
            style={{ width: '100%', padding: '13px 16px', background: '#0f172a', border: `1px solid ${title.trim() ? '#1f2937' : '#374151'}`, borderRadius: 10, color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Summary */}
        <div style={{ marginBottom: 22 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
            Video Summary <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <textarea
            value={summary}
            onChange={e => setSummary(e.target.value)}
            placeholder="What's the video about? This helps AI engineer the perfect emotional hook for your thumbnail"
            rows={3}
            style={{ width: '100%', padding: '11px 16px', background: '#0f172a', border: `1px solid ${summary.trim() ? '#1f2937' : '#374151'}`, borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
        </div>

        {/* Scene Images from Content Generation — click to add as character photos */}
        {sceneImages && sceneImages.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
              Select from Generated Scenes <span style={{ color: '#6b7280', fontWeight: 400, textTransform: 'none' }}>(click to add)</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {sceneImages.map((scene, i) => {
                const isAdded = chars.some(c => c?.remoteUrl === scene.image_url);
                return (
                  <div
                    key={scene.id || i}
                    onClick={() => {
                      if (isAdded) {
                        setChars(prev => {
                          const filtered = prev.filter(c => c?.remoteUrl !== scene.image_url);
                          while (filtered.length < 2) filtered.push(null);
                          return filtered;
                        });
                      } else if (chars.length < MAX_PHOTOS) {
                        const newChar = { url: scene.image_url, remoteUrl: scene.image_url, name: `Scene ${scene.scene_number}`, description: '' };
                        setChars(prev => {
                          const emptyIdx = prev.findIndex(c => c === null);
                          if (emptyIdx !== -1) { const a = [...prev]; a[emptyIdx] = newChar; return a; }
                          return [...prev, newChar];
                        });
                      }
                    }}
                    style={{
                      borderRadius: 8, overflow: 'hidden', aspectRatio: '16/9',
                      border: isAdded ? '2px solid #22c55e' : '2px solid #1f2937',
                      cursor: 'pointer', position: 'relative', transition: 'border-color 0.15s',
                      opacity: isAdded ? 1 : 0.7,
                    }}
                  >
                    <img src={scene.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.85),transparent)', padding: '12px 6px 4px', fontSize: 10, color: '#ccc', textAlign: 'center' }}>
                      Scene {scene.scene_number}
                    </div>
                    {isAdded && (
                      <div style={{ position: 'absolute', top: 4, right: 4, background: '#22c55e', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircle size={12} color="#fff" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p style={{ color: '#6b7280', fontSize: 11, marginTop: 6 }}>
              {chars.filter(c => c?.remoteUrl).length} scene image{chars.filter(c => c?.remoteUrl).length !== 1 ? 's' : ''} selected · You can also upload additional photos below
            </p>
          </div>
        )}

        {/* Character Photos (required, min 2, max 14) */}
        <div style={{ marginBottom: 26 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 10 }}>
            {sceneImages?.length > 0 ? 'Additional Uploads' : 'Key Images from Video'} <span style={{ color: '#ef4444' }}>* (min 1, up to {MAX_PHOTOS})</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
            {chars.map((char, i) => (
              <CharSlot key={i} index={i} label={`Photo ${i + 1}`} char={char} onUpload={handleUpload} onRemove={handleRemove} onDescriptionChange={handleDescriptionChange} />
            ))}
            {/* Add more button */}
            {chars.length < MAX_PHOTOS && (
              <div
                onClick={handleAddSlot}
                style={{
                  border: '2px dashed #374151', borderRadius: 12, aspectRatio: '3/4',
                  background: '#0f172a', cursor: 'pointer', display: 'flex',
                  flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 6, color: '#4b5563', transition: 'border-color 0.2s',
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#6b7280' }}>+</div>
                <div style={{ fontSize: 11, color: '#4b5563', textAlign: 'center' }}>Add Photo</div>
                <div style={{ fontSize: 9, color: '#374151' }}>{chars.length}/{MAX_PHOTOS}</div>
              </div>
            )}
          </div>
          {uploadedChars.length < 1 && (
            <p style={{ color: '#ef4444', fontSize: 11, marginTop: 8 }}>
              ⚠️ Upload at least 1 photo — the key image AI will use in the thumbnail
            </p>
          )}
          {uploadedChars.length >= 1 && (
            <p style={{ color: '#22c55e', fontSize: 11, marginTop: 8 }}>
              ✅ {uploadedChars.length} photo{uploadedChars.length > 1 ? 's' : ''} uploaded — nano-banana-2 will use all {uploadedChars.length} as reference
            </p>
          )}
        </div>

        {/* Template Picker (required) */}
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Choose a Reference Template <span style={{ color: '#ef4444' }}>*</span>
            </label>
          </div>
          <p style={{ color: '#4b5563', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
            Pick a proven layout — AI will create a <strong style={{ color: '#a78bfa' }}>direct replica</strong> using your photos and AI-generated overlay text.
          </p>
          <ThumbnailTemplatePicker
            selectedTemplate={selectedUserTemplate}
            onSelect={setSelectedUserTemplate}
            title={title}
            summary={summary}
          />
        </div>

        {/* Validation summary */}
        {missingFields.length > 0 && (
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f87171', marginBottom: 4 }}>Missing required fields:</div>
            <div style={{ fontSize: 11, color: '#fca5a5' }}>{missingFields.join(' · ')}</div>
          </div>
        )}

        <button
          onClick={handleGenerateConcepts}
          disabled={!canSubmit}
          style={{
            width: '100%', padding: '15px', borderRadius: 12, border: 'none',
            background: canSubmit ? 'linear-gradient(135deg, #7c3aed, #db2777)' : '#1f2937',
            color: canSubmit ? '#fff' : '#4b5563', cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Wand2 size={18} />
          Generate 5 CTR Overlay Texts for "{selectedUserTemplate?.name || '...'}"
        </button>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ════════════════════════════════════════════════════════════════
  // STEP 1 — Loading / Pick a concept
  // ════════════════════════════════════════════════════════════════
  if (step === 1) return (
    <div style={{ minHeight: '100vh', background: '#070711', color: '#fff' }}>
      <div style={{ borderBottom: '1px solid #1f2937', padding: '15px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => { setStep(0); setError(null); }}
          disabled={loadingConcepts}
          style={{ background: 'none', border: 'none', color: loadingConcepts ? '#374151' : '#6b7280', cursor: loadingConcepts ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ width: 1, height: 20, background: '#1f2937' }} />
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          {loadingConcepts ? '🧠 Engineering Concepts…' : `Pick a Concept — ${concepts.length} generated`}
        </div>
      </div>

      {/* Loading state */}
      {loadingConcepts && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 56px)' }}>
          <div style={{ textAlign: 'center', maxWidth: 460, padding: 24 }}>
            <div style={{
              width: 76, height: 76, borderRadius: '50%',
              background: 'linear-gradient(135deg, #7c3aed, #db2777)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 22px', animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              <Sparkles size={30} color="#fff" />
            </div>
            <h2 style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>Designing 5 Thumbnail Concepts</h2>
            <p style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.6, marginBottom: 22 }}>
              {loadingPhase || 'Gemini is analysing your title and detecting the mood…'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                'Analysing title tone and emotional signals',
                'Detecting mood, niche and psychological triggers',
                'Engineering 5 high-CTR overlay texts',
                'Applying Zero Overlap + Sentiment Pivot laws',
                'Writing cinematic image prompts',
                'Saving concepts to your library…',
              ].map((phase, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0f172a', borderRadius: 8, padding: '9px 14px' }}>
                  <Loader2 size={13} style={{ flexShrink: 0, color: '#7c3aed', animation: `spin ${0.7 + i * 0.12}s linear infinite` }} />
                  <span style={{ color: '#6b7280', fontSize: 12 }}>{phase}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {!loadingConcepts && error && (
        <div style={{ maxWidth: 580, margin: '40px auto', padding: '0 16px' }}>
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <AlertCircle size={16} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontWeight: 700, fontSize: 14, color: '#f87171' }}>Generation Failed</div>
            </div>
            <div style={{ fontSize: 13, color: '#fca5a5', lineHeight: 1.6, marginBottom: 16 }}>{error}</div>
            <button onClick={() => { setStep(0); setError(null); }} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              ← Try Again
            </button>
          </div>
        </div>
      )}

      {/* Overlay text selection grid */}
      {!loadingConcepts && !error && concepts.length > 0 && (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '22px 16px' }}>
          <StepDots current={1} total={4} />

          {/* Mood + metadata banner */}
          {(templateMeta || detectedMood) && (
            <div style={{
              background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)',
              borderRadius: 12, padding: '12px 16px', marginBottom: 18,
              display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
            }}>
              {detectedMood && (
                <span style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa' }}>
                  🎯 Mood: <span style={{ color: '#fff' }}>{detectedMood}</span>
                </span>
              )}
              <span style={{ fontSize: 11, color: '#22c55e', background: 'rgba(34,197,94,0.1)', borderRadius: 6, padding: '2px 8px' }}>
                ✓ {uploadedChars.length} photo{uploadedChars.length > 1 ? 's' : ''} ready
              </span>
              <span style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', borderRadius: 6, padding: '2px 8px' }}>
                ✓ Template: {selectedUserTemplate?.name}
              </span>
            </div>
          )}

          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Select Your Overlay Text</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              Pick one — AI will render <strong style={{ color: '#fff' }}>"{selectedUserTemplate?.name}"</strong> template with your photos and this text
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 20 }}>
            {concepts.map(c => (
              <OverlayTextCard
                key={c.id}
                concept={c}
                isSelected={!useCustomOverlay && selectedConcept?.id === c.id}
                onSelect={(concept) => { setSelectedConcept(concept); setUseCustomOverlay(false); }}
              />
            ))}
          </div>

          {/* Custom overlay text input */}
          <div style={{
            background: '#0b0b1a', border: useCustomOverlay ? '2px solid #f59e0b' : '2px solid #1f2937',
            borderRadius: 12, padding: '16px 18px', marginBottom: 20,
            transition: 'border-color 0.15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Target size={14} color="#f59e0b" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>Or Write Your Own Overlay Text</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={customOverlay}
                onChange={e => {
                  const val = e.target.value.toUpperCase().slice(0, 30);
                  setCustomOverlay(val);
                  if (val.trim()) setUseCustomOverlay(true);
                  else setUseCustomOverlay(false);
                }}
                placeholder="e.g. SHE LIED!"
                maxLength={30}
                style={{
                  flex: 1, padding: '11px 14px', background: '#0f172a',
                  border: '1px solid #374151', borderRadius: 8,
                  color: '#fff', fontSize: 18, fontWeight: 900,
                  fontFamily: 'Impact, Arial Black, sans-serif',
                  letterSpacing: '0.04em', outline: 'none',
                }}
              />
              {customOverlay.trim() && (
                <button
                  onClick={() => { setUseCustomOverlay(true); }}
                  style={{
                    padding: '11px 16px', borderRadius: 8, border: 'none',
                    background: useCustomOverlay ? '#f59e0b' : '#1f2937',
                    color: useCustomOverlay ? '#000' : '#9ca3af',
                    cursor: 'pointer', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap',
                  }}
                >
                  {useCustomOverlay ? '✓ Using This' : 'Use This'}
                </button>
              )}
            </div>
            <div style={{ fontSize: 10, color: '#4b5563', marginTop: 6 }}>
              MAX 3-4 WORDS · ALL CAPS · {customOverlay.length}/30 characters
            </div>
          </div>

          {/* Generate button */}
          {(selectedConcept || (useCustomOverlay && customOverlay.trim())) && (
            <button
              onClick={() => {
                if (useCustomOverlay && customOverlay.trim() && selectedConcept) {
                  // Create a modified concept with custom overlay text
                  const customConcept = { ...selectedConcept, text_overlay: customOverlay.trim() };
                  handleGenerateImage(customConcept);
                } else if (selectedConcept) {
                  handleGenerateImage(selectedConcept);
                }
              }}
              disabled={generating}
              style={{
                width: '100%', padding: '16px', borderRadius: 12, border: 'none',
                background: generating ? '#374151' : 'linear-gradient(135deg, #7c3aed, #db2777)',
                color: '#fff', cursor: generating ? 'not-allowed' : 'pointer',
                fontWeight: 700, fontSize: 15,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {generating
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Rendering…</>
                : <><Sparkles size={16} /> Generate Thumbnail: "{useCustomOverlay && customOverlay.trim() ? customOverlay.trim() : selectedConcept?.text_overlay}" on "{selectedUserTemplate?.name}"</>
              }
            </button>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,0.5)}50%{box-shadow:0 0 0 18px transparent}}
      `}</style>
    </div>
  );

  // ════════════════════════════════════════════════════════════════
  // STEP 2 — Rendering
  // ════════════════════════════════════════════════════════════════
  if (step === 2) return (
    <div style={{ minHeight: '100vh', background: '#070711', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'linear-gradient(135deg, #7c3aed, #db2777)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 22px', animation: 'pulse 1.5s ease-in-out infinite',
        }}>
          <Sparkles size={32} color="#fff" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Rendering + Upscaling + Color Grading</h2>

        {selectedConcept?.text_overlay && (
          <div style={{
            fontFamily: 'Impact, Arial Black', fontSize: 22, fontWeight: 900,
            color: '#fff', letterSpacing: '0.05em', textShadow: '2px 2px 0 #000',
            background: '#0f172a', borderRadius: 8, padding: '10px 16px',
            marginBottom: 16, display: 'inline-block',
          }}>
            {selectedConcept.text_overlay}
          </div>
        )}

        <p style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.6, marginBottom: 22 }}>
          Ideogram renders → auto-upscale 2× → mood-matched color grade, sharpness, saturation & vignette. Takes 60–120 seconds…
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {[
            { icon: '📸', label: 'Uploading reference photos to KIE' },
            { icon: '🔒', label: 'Locking in real faces with Ideogram Character' },
            { icon: '🎨', label: 'Rendering cinematic scene at 1920×1080' },
            { icon: '🔍', label: 'Upscaling to 2× resolution + sharpening' },
            { icon: '🎬', label: 'Applying mood color grade, saturation & vignette' },
            { icon: '💾', label: 'Saving final enhanced thumbnail' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0f172a', borderRadius: 8, padding: '10px 14px' }}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              <span style={{ color: '#9ca3af', fontSize: 12 }}>{item.label}</span>
              <Loader2 size={12} style={{ marginLeft: 'auto', color: '#7c3aed', animation: `spin ${0.8 + i * 0.1}s linear infinite` }} />
            </div>
          ))}
        </div>

        {selectedConcept?.ctr_score && (
          <div style={{ marginTop: 18, background: '#0f172a', borderRadius: 10, padding: '10px 16px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#4b5563' }}>Predicted CTR Score</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#22c55e' }}>{selectedConcept.ctr_score}/10</span>
          </div>
        )}
      </div>
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,0.5)}50%{box-shadow:0 0 0 18px transparent}}
      `}</style>
    </div>
  );

  // ════════════════════════════════════════════════════════════════
  // STEP 3 — Result
  // ════════════════════════════════════════════════════════════════
  const finalUrl = generatedUrl || selectedConcept?.image_url;
  const ctrScore = selectedConcept?.ctr_score || 8;
  const ctrColor = ctrScore >= 9 ? '#22c55e' : ctrScore >= 7 ? '#f59e0b' : '#9ca3af';

  return (
    <div style={{ minHeight: '100vh', background: '#070711', color: '#fff' }}>
      <div style={{ borderBottom: '1px solid #1f2937', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => { setStep(1); setGeneratedUrl(null); setError(null); }}
            style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          >
            <ArrowLeft size={15} /> Back to concepts
          </button>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Your Thumbnail</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => selectedConcept && handleGenerateImage(selectedConcept)}
            disabled={!selectedConcept}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #1f2937', background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={13} /> Re-render
          </button>
          {finalUrl && (
            <button onClick={handleDownload} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={13} /> Download
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '22px 16px' }}>
        <StepDots current={3} total={4} />

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#fca5a5', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Main image */}
        {finalUrl ? (
          <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.7)', marginBottom: 18 }}>
            <img src={finalUrl} alt="Generated thumbnail" style={{ width: '100%', display: 'block' }} />
          </div>
        ) : (
          <div style={{ aspectRatio: '16/9', background: '#0f172a', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18, border: '2px dashed #1f2937' }}>
            <div style={{ textAlign: 'center', color: '#4b5563' }}>
              <ImageIcon size={32} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 13 }}>No image yet</div>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'CTR Score', value: `${ctrScore}/10`, color: ctrColor },
            { label: 'Emotion', value: (selectedConcept?.psychological_trigger || selectedConcept?.concept_type || 'SHOCK').toUpperCase(), color: '#7c3aed' },
            { label: 'Hook Text', value: selectedConcept?.text_overlay || '—', color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} style={{ background: '#0f172a', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontWeight: 800, fontSize: 13, color: s.color, lineHeight: 1.2, wordBreak: 'break-word' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Why it works */}
        {selectedConcept?.why_it_stops_scrolling && (
          <div style={{ background: '#0b0b1a', border: '1px solid #1f2937', borderRadius: 12, padding: '13px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Why this triggers clicks</div>
            <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.5 }}>{selectedConcept.why_it_stops_scrolling}</div>
          </div>
        )}

        {/* Try other overlay texts */}
        {concepts.filter(c => c.id !== selectedConcept?.id).length > 0 && (
          <div style={{ background: '#0b0b1a', border: '1px solid #1f2937', borderRadius: 12, padding: '13px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Try Another Overlay Text</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {concepts.filter(c => c.id !== selectedConcept?.id).map(c => (
                <button key={c.id} onClick={() => handleGenerateImage(c)}
                  style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #1f2937', background: '#0f172a', color: '#9ca3af', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Sparkles size={11} />
                  #{c.rank} "{c.text_overlay || 'text'}"
                  <span style={{ color: '#22c55e', fontSize: 10 }}>⭐{c.ctr_score}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}