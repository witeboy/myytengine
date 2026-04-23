import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Upload, X, Loader2, Sparkles, Download, CheckCircle2,
  ChevronRight, ChevronLeft, Wand2, Image, Type, Palette,
  RefreshCw, Star, Zap, Users, Camera
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// TEMPLATE DEFINITIONS — The 6 Holy Grail Templates
// ═══════════════════════════════════════════════════════════════
const TEMPLATES = [
  {
    id: 'vs_confrontation',
    name: 'VS / Confrontation',
    emoji: '⚔️',
    bestFor: ['drama', 'true_crime', 'relationships', 'debate', 'court'],
    description: 'Split-screen showdown. Two forces in conflict.',
    textStyle: { color: '#FFD700', stroke: '#000000', strokeWidth: 14, font: 'Impact', position: 'center', angle: -5, shadow: true },
    layoutHint: 'Two characters split-screen. Bold VS in center at angle. Gold text with black outline.',
    exampleText: 'BOYFRIEND vs HUSBAND',
    imageGuide: 'Two characters on opposite halves. Left: calm/victim. Right: aggressive/antagonist. Dark dramatic background.',
  },
  {
    id: 'quote_dark',
    name: 'Quote / Hot Take',
    emoji: '💬',
    bestFor: ['finance', 'motivation', 'business', 'advice', 'tech'],
    description: 'Bold short statement. Person reacting naturally.',
    textStyle: { color: '#FFFFFF', stroke: '#000000', strokeWidth: 12, font: 'Impact', position: 'bottom_left', angle: 0, shadow: true },
    layoutHint: 'Dark background. Person smiling/laughing naturally. Large white text left side.',
    exampleText: "DON'T WORK",
    imageGuide: 'Person in casual setting, genuine laugh/smile, dark or gradient background, rule of thirds right side.',
  },
  {
    id: 'before_after',
    name: 'Before / After',
    emoji: '📊',
    bestFor: ['finance', 'fitness', 'youtube', 'business', 'education'],
    description: 'Transformation comparison with stats.',
    textStyle: { color: '#FFFFFF', stroke: '#000000', strokeWidth: 10, font: 'Anton', position: 'bottom_center', angle: 0, shadow: true },
    layoutHint: 'Split screen. Left dark (before with low number). Right bright (after with high number). Arrows pointing up/down.',
    exampleText: '0 SUBS → 1.3M SUBS',
    imageGuide: 'Same person shown twice. Left: dejected, gray tones. Right: confident, bright colors. Stat boxes with numbers.',
  },
  {
    id: 'character_product',
    name: 'Character + Objects',
    emoji: '🎯',
    bestFor: ['entertainment', 'product', 'lifestyle', 'gaming', 'tech'],
    description: 'Energetic person with flying objects around them.',
    textStyle: { color: '#FFFFFF', stroke: '#000000', strokeWidth: 11, font: 'Impact', position: 'top_left', angle: 0, shadow: true },
    layoutHint: 'Person center-left pointing or gesturing. Objects flying around them. Bold text top-left or bottom.',
    exampleText: 'ATTRACTIVE THUMBNAILS',
    imageGuide: 'Dynamic person pose, objects exploding around them, colorful background, energy and motion blur on objects.',
  },
  {
    id: 'shock_number',
    name: 'Shock + Number',
    emoji: '💰',
    bestFor: ['finance', 'business', 'true_crime', 'motivation', 'gaming'],
    description: 'Massive number dominates. Shocked reaction face.',
    textStyle: { color: '#FFD700', stroke: '#000000', strokeWidth: 14, font: 'Impact', position: 'left', angle: 0, shadow: true },
    layoutHint: 'Huge number left 60% of frame. Shocked face right. Clean white or simple background. Red accent icons.',
    exampleText: '$50,000 PER MONTH',
    imageGuide: 'Clean background. Massive bold number dominates left. Person with open-mouth shock right side. Simple, high contrast.',
  },
  {
    id: 'mrbeast_chaos',
    name: 'MrBeast Chaos',
    emoji: '🔥',
    bestFor: ['entertainment', 'gaming', 'challenge', 'viral', 'youth'],
    description: 'Extreme close-up. Chaotic layers. Stat overlays.',
    textStyle: { color: '#00FF00', stroke: '#000000', strokeWidth: 13, font: 'Impact', position: 'top_right', angle: 0, shadow: true },
    layoutHint: 'Face extreme close-up left 30%. Chaotic explosive background. Stat boxes with numbers (CTR%, views). Green/yellow.',
    exampleText: '25.8% CTR',
    imageGuide: 'Face very close to camera, extreme expression, background is chaotic explosion/action, stat boxes overlaid, vivid green accents.',
  },
];

// ═══════════════════════════════════════════════════════════════
// CANVAS COMPOSITOR — Bakes text into image like MrBeast
// ═══════════════════════════════════════════════════════════════
async function bakeTextIntoImage(imageUrl, textConfig, template, canvasWidth, canvasHeight) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth || 1280;
    canvas.height = canvasHeight || 720;
    const ctx = canvas.getContext('2d');

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Draw base image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const W = canvas.width;
      const H = canvas.height;
      const text = textConfig.text.toUpperCase();
      const style = template.textStyle;

      // Font sizing — scale by word count and canvas
      const words = text.split(' ');
      const longestWord = words.reduce((a, b) => a.length > b.length ? a : b, '');
      let fontSize = Math.floor(H * 0.18); // start at 18% of height
      if (words.length > 3) fontSize = Math.floor(H * 0.14);
      if (words.length > 5) fontSize = Math.floor(H * 0.11);

      ctx.font = `900 ${fontSize}px ${style.font || 'Impact'}, Arial Black, sans-serif`;

      // Scale down if text too wide
      const maxW = W * 0.85;
      while (ctx.measureText(longestWord).width > maxW && fontSize > 30) {
        fontSize -= 2;
        ctx.font = `900 ${fontSize}px ${style.font || 'Impact'}, Arial Black, sans-serif`;
      }

      // Position mapping
      const positions = {
        center:        { x: W / 2, y: H / 2, align: 'center' },
        top_left:      { x: W * 0.05, y: H * 0.15, align: 'left' },
        top_center:    { x: W / 2, y: H * 0.15, align: 'center' },
        top_right:     { x: W * 0.95, y: H * 0.15, align: 'right' },
        bottom_left:   { x: W * 0.05, y: H * 0.82, align: 'left' },
        bottom_center: { x: W / 2, y: H * 0.82, align: 'center' },
        left:          { x: W * 0.05, y: H / 2, align: 'left' },
      };

      const pos = positions[style.position] || positions.bottom_center;
      ctx.textAlign = pos.align;
      ctx.textBaseline = 'middle';

      // Apply rotation if needed (VS template)
      if (style.angle && style.angle !== 0) {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate((style.angle * Math.PI) / 180);
        drawTextLayers(ctx, words, 0, 0, fontSize, style, W, H);
        ctx.restore();
      } else {
        drawTextLayers(ctx, words, pos.x, pos.y, fontSize, style, W, H);
      }

      resolve(canvas.toDataURL('image/png', 0.95));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
}

function drawTextLayers(ctx, words, x, y, fontSize, style, W, H) {
  const lineHeight = fontSize * 1.15;
  const startY = y - ((words.length - 1) * lineHeight) / 2;

  // Draw each word on its own line for maximum impact (MrBeast style)
  words.forEach((word, i) => {
    const lineY = startY + i * lineHeight;
    const sw = style.strokeWidth || 10;

    // Shadow layer
    if (style.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 4;
    }

    // Stroke (thick outline — MrBeast signature)
    ctx.strokeStyle = style.stroke || '#000000';
    ctx.lineWidth = sw;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeText(word, x, lineY);

    // Reset shadow for fill
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Fill
    ctx.fillStyle = style.color || '#FFFFFF';
    ctx.fillText(word, x, lineY);
  });
}

// ═══════════════════════════════════════════════════════════════
// STEP INDICATOR
// ═══════════════════════════════════════════════════════════════
function StepIndicator({ step, total }) {
  const steps = ['Upload Photos', 'Choose Template', 'Pick Text', 'Generate & Bake'];
  return (
    <div className="flex items-center gap-1 mb-4">
      {steps.map((label, i) => {
        const num = i + 1;
        const isActive = num === step;
        const isDone = num < step;
        return (
          <React.Fragment key={i}>
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${
              isDone ? 'bg-green-100 text-green-700' :
              isActive ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-400' :
              'bg-gray-100 text-gray-400'
            }`}>
              {isDone ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-3 text-center">{num}</span>}
              <span className="hidden sm:inline">{label}</span>
            </div>
            {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function ThumbnailStudio({
  transcript, title, niche, projectId,
  onThumbnailReady, // (publicUrl) => void
}) {
  const [step, setStep] = useState(1);

  // Step 1 — Photos
  const [photos, setPhotos] = useState([]);
  const fileInputRef = useRef(null);

  // Step 2 — Template
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Step 3 — Text
  const [textOptions, setTextOptions] = useState([]);
  const [selectedText, setSelectedText] = useState('');
  const [customText, setCustomText] = useState('');

  // Step 4 — Generate & Bake
  const [generatedImages, setGeneratedImages] = useState([]); // [{url, taskId, status, bakedUrl}]
  const [generating, setGenerating] = useState(false);
  const [baking, setBaking] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // ── Step 1: Photo upload ──────────────────────────────────────
  const handlePhotoAdd = (files) => {
    const newPhotos = Array.from(files).slice(0, 4 - photos.length).map(f => ({
      file: f,
      url: URL.createObjectURL(f),
      label: '',
    }));
    setPhotos(prev => [...prev, ...newPhotos].slice(0, 4));
  };

  const handlePhotoRemove = (idx) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Step 2: Analyze transcript → suggest template + text ─────
  const analyzeAndSuggest = async () => {
    setAnalyzing(true);
    setError('');
    try {
      const res = await base44.functions.invoke('analyzeForThumbnail', {
        transcript: transcript?.substring(0, 3000) || '',
        title: title || '',
        niche: niche || 'general',
        has_photos: photos.length > 0,
      });
      const data = res.data || {};
      setAiAnalysis(data);

      // Auto-select the AI-recommended template
      const recommended = TEMPLATES.find(t => t.id === data.recommended_template) || TEMPLATES[0];
      setSelectedTemplate(recommended);
      setTextOptions(data.text_options || []);
      setSelectedText(data.text_options?.[0] || title?.substring(0, 30).toUpperCase() || '');
    } catch (e) {
      setError('Analysis failed: ' + e.message);
      setSelectedTemplate(TEMPLATES[0]);
      setTextOptions([title?.substring(0, 30).toUpperCase() || 'WATCH THIS']);
      setSelectedText(title?.substring(0, 30).toUpperCase() || 'WATCH THIS');
    }
    setAnalyzing(false);
  };

  // ── Step 4: Generate 3 base images ───────────────────────────
  const generateImages = async () => {
    if (!selectedTemplate) return;
    setGenerating(true);
    setError('');
    setGeneratedImages([]);

    const KIE_KEY_CHECK = true; // backend handles key
    const textToUse = customText || selectedText;

    // Prepare photos as base64 if provided
    const charPhotos = [];
    for (const photo of photos) {
      try {
        const b64 = await new Promise((res) => {
          const reader = new FileReader();
          reader.onload = e => res(e.target.result.split(',')[1]);
          reader.readAsDataURL(photo.file);
        });
        charPhotos.push({ b64, mime: 'image/jpeg', label: photo.label });
      } catch (_) {}
    }

    // Build 3 slightly varied prompts for 3 options
    const templatePrompts = buildTemplatePrompts(selectedTemplate, aiAnalysis, title, niche, textToUse);
    const placeholders = templatePrompts.map((_, i) => ({
      id: i, status: 'pending', url: null, bakedUrl: null, taskId: null,
    }));
    setGeneratedImages(placeholders);

    // Submit all 3 in parallel
    for (let i = 0; i < templatePrompts.length; i++) {
      try {
        // Create a temp concept for this generation
        const concept = await base44.entities.ThumbnailConcepts.create({
          project_id: projectId,
          rank: i + 1,
          image_prompt: templatePrompts[i],
          text_overlay: textToUse,
          concept_description: `Studio option ${i + 1} — ${selectedTemplate.name}`,
          is_selected: false,
        });

        const res = await base44.functions.invoke('generateThumbnailImage', {
          concept_id: concept.id,
          char_photos: charPhotos.length > 0 ? charPhotos : undefined,
        });

        const data = res.data || {};
        if (data.pending && data.task_id) {
          setGeneratedImages(prev => prev.map((p, idx) =>
            idx === i ? { ...p, status: 'polling', taskId: data.task_id, conceptId: concept.id } : p
          ));
          // Poll in background
          pollImage(i, data.task_id, concept.id);
        } else if (data.image_url) {
          setGeneratedImages(prev => prev.map((p, idx) =>
            idx === i ? { ...p, status: 'ready', url: data.image_url, conceptId: concept.id } : p
          ));
        }
      } catch (e) {
        setGeneratedImages(prev => prev.map((p, idx) =>
          idx === i ? { ...p, status: 'error', error: e.message } : p
        ));
      }
    }
    setGenerating(false);
  };

  const pollImage = async (idx, taskId, conceptId) => {
    const maxAttempts = 30;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const poll = await base44.functions.invoke('pollThumbnailTask', {
          task_id: taskId, concept_id: conceptId, task_type: 'kie',
        });
        if (poll.data?.completed && poll.data?.image_url) {
          setGeneratedImages(prev => prev.map((p, i) =>
            i === idx ? { ...p, status: 'ready', url: poll.data.image_url } : p
          ));
          return;
        }
        if (poll.data?.error) {
          setGeneratedImages(prev => prev.map((p, i) =>
            i === idx ? { ...p, status: 'error', error: poll.data.error } : p
          ));
          return;
        }
      } catch (_) {}
    }
    setGeneratedImages(prev => prev.map((p, i) =>
      i === idx ? { ...p, status: 'error', error: 'Timed out' } : p
    ));
  };

  // ── Bake text into all ready images ──────────────────────────
  const bakeAllImages = async () => {
    setBaking(true);
    const textToUse = customText || selectedText;
    const updated = [...generatedImages];

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status !== 'ready' || !updated[i].url) continue;
      try {
        const bakedDataUrl = await bakeTextIntoImage(
          updated[i].url,
          { text: textToUse },
          selectedTemplate,
          1280, 720
        );
        updated[i] = { ...updated[i], bakedUrl: bakedDataUrl };
        setGeneratedImages([...updated]);
      } catch (e) {
        console.warn('Bake failed for image', i, e.message);
      }
    }
    setBaking(false);
  };

  // Auto-bake when all images are ready
  useEffect(() => {
    const allReady = generatedImages.length > 0 && generatedImages.every(g => g.status === 'ready' || g.status === 'error');
    const noneBaked = generatedImages.some(g => g.status === 'ready' && !g.bakedUrl);
    if (allReady && noneBaked && !baking) {
      bakeAllImages();
    }
  }, [generatedImages]);

  // ── Select & upload winner ────────────────────────────────────
  const handleSelectAndUpload = async (image) => {
    setSelectedResult(image);
    setUploading(true);
    try {
      const dataUrl = image.bakedUrl || image.url;
      // Convert to blob
      let blob;
      if (dataUrl.startsWith('data:')) {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        const u8arr = new Uint8Array(bstr.length);
        for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
        blob = new Blob([u8arr], { type: mime });
      } else {
        const resp = await fetch(dataUrl);
        blob = await resp.blob();
      }
      const file = new File([blob], `thumbnail_studio_${Date.now()}.png`, { type: 'image/png' });
      const cleanFile = new File([file], file.name, { type: file.type });
      const { file_url } = await base44.integrations.Core.UploadFile({ file: cleanFile });
      if (file_url) {
        onThumbnailReady?.(file_url);
      }
    } catch (e) {
      setError('Upload failed: ' + e.message);
    }
    setUploading(false);
  };

  const handleDownload = (image) => {
    const url = image.bakedUrl || image.url;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `thumbnail_${selectedTemplate?.id || 'studio'}_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="space-y-4">
      <StepIndicator step={step} total={4} />

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>
      )}

      {/* ── STEP 1: Upload Photos ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold">Upload Character Photos</h3>
            <Badge variant="outline" className="text-[10px]">Optional</Badge>
          </div>
          <p className="text-xs text-gray-500">
            Upload photos of characters from your video. AI will use these real faces in the thumbnail.
            Skip this step if you want AI to generate characters from scratch.
          </p>

          <input
            ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => handlePhotoAdd(e.target.files)}
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {photos.map((photo, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden border-2 border-blue-300">
                <img src={photo.url} className="w-full h-full object-cover" alt="" />
                <button
                  onClick={() => handlePhotoRemove(i)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                  <input
                    className="w-full text-[9px] bg-transparent text-white placeholder-gray-400 outline-none"
                    placeholder="Character name..."
                    value={photo.label}
                    onChange={e => setPhotos(prev => prev.map((p, idx) => idx === i ? { ...p, label: e.target.value } : p))}
                  />
                </div>
              </div>
            ))}
            {photos.length < 4 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 flex flex-col items-center justify-center gap-1 text-gray-400 transition-colors"
              >
                <Upload className="w-5 h-5" />
                <span className="text-[10px]">Add Photo</span>
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => { setStep(2); analyzeAndSuggest(); }}
              className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2"
            >
              <Sparkles className="w-4 h-4" />
              {photos.length > 0 ? 'Analyze & Continue' : 'Skip to Templates'}
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Template Selection ── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-purple-600" />
              <h3 className="text-sm font-semibold">Choose Template</h3>
            </div>
            {analyzing && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
          </div>

          {aiAnalysis && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-[10px] font-semibold text-blue-800 mb-1">🧠 AI Analysis</p>
              <p className="text-[10px] text-blue-700">{aiAnalysis.reasoning || 'Based on your transcript, here are the best templates.'}</p>
              {aiAnalysis.key_subject && (
                <p className="text-[10px] text-blue-600 mt-1">📌 Key subject: <strong>{aiAnalysis.key_subject}</strong></p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TEMPLATES.map(template => {
              const isRecommended = aiAnalysis?.recommended_template === template.id;
              const isSelected = selectedTemplate?.id === template.id;
              return (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    isSelected ? 'border-purple-500 bg-purple-50 shadow-md' :
                    'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{template.emoji}</span>
                      <span className="text-xs font-bold text-gray-900">{template.name}</span>
                    </div>
                    <div className="flex gap-1">
                      {isRecommended && (
                        <Badge className="bg-amber-100 text-amber-700 text-[9px]">
                          <Star className="w-2.5 h-2.5 mr-0.5" /> AI Pick
                        </Badge>
                      )}
                      {isSelected && <Badge className="bg-purple-100 text-purple-700 text-[9px]">Selected</Badge>}
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-600 mb-2">{template.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {template.bestFor.slice(0, 3).map(tag => (
                      <span key={tag} className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{tag}</span>
                    ))}
                  </div>
                  <div className="mt-2 p-1.5 bg-gray-900 rounded text-[9px] font-black text-yellow-400 text-center tracking-wide">
                    e.g. "{template.exampleText}"
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-1"><ChevronLeft className="w-3.5 h-3.5" /> Back</Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!selectedTemplate}
              className="flex-1 bg-purple-600 hover:bg-purple-700 gap-2"
            >
              <ChevronRight className="w-4 h-4" /> Choose Text
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Text Selection ── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-orange-600" />
            <h3 className="text-sm font-semibold">Choose Overlay Text</h3>
          </div>
          <p className="text-[10px] text-gray-500">
            Text will be baked into the thumbnail in <strong>{selectedTemplate?.textStyle.font}</strong> with thick black stroke — MrBeast style.
          </p>

          {/* AI text options */}
          {textOptions.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">AI Suggestions</p>
              <div className="grid grid-cols-1 gap-2">
                {textOptions.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => { setSelectedText(opt); setCustomText(''); }}
                    className={`px-3 py-2.5 rounded-lg border-2 text-left transition-all ${
                      selectedText === opt && !customText
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-sm tracking-wide text-gray-900 uppercase">{opt}</span>
                      {selectedText === opt && !customText && <CheckCircle2 className="w-4 h-4 text-orange-500 flex-shrink-0" />}
                    </div>
                    {/* Preview the text style */}
                    <div
                      className="mt-1.5 py-1 px-2 rounded text-[11px] font-black text-center uppercase tracking-wider"
                      style={{
                        backgroundColor: '#1a1a1a',
                        color: selectedTemplate?.textStyle.color || '#FFD700',
                        textShadow: '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
                        WebkitTextStroke: '0.5px #000',
                      }}
                    >
                      {opt}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom text */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Or Type Custom</p>
            <input
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm font-bold uppercase tracking-wide focus:border-orange-400 outline-none"
              placeholder="YOUR TEXT HERE..."
              value={customText}
              onChange={e => { setCustomText(e.target.value.toUpperCase()); setSelectedText(''); }}
              maxLength={40}
            />
            {customText && (
              <div
                className="py-2 px-3 rounded-lg text-sm font-black text-center uppercase tracking-widest"
                style={{
                  backgroundColor: '#1a1a1a',
                  color: selectedTemplate?.textStyle.color || '#FFD700',
                  textShadow: '3px 3px 0 #000, -1px -1px 0 #000, 2px -1px 0 #000, -1px 2px 0 #000',
                }}
              >
                {customText}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)} className="gap-1"><ChevronLeft className="w-3.5 h-3.5" /> Back</Button>
            <Button
              onClick={() => { setStep(4); generateImages(); }}
              disabled={!selectedText && !customText}
              className="flex-1 bg-orange-500 hover:bg-orange-600 gap-2"
            >
              <Zap className="w-4 h-4" /> Generate 3 Thumbnails
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Results ── */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image className="w-4 h-4 text-green-600" />
              <h3 className="text-sm font-semibold">Your 3 Thumbnails</h3>
              {baking && (
                <Badge className="bg-orange-100 text-orange-700 text-[9px]">
                  <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" /> Baking text...
                </Badge>
              )}
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => { setStep(3); setGeneratedImages([]); }}
              className="h-7 text-xs gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Regenerate
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {generatedImages.map((img, i) => (
              <div
                key={i}
                className={`rounded-xl border-2 overflow-hidden transition-all ${
                  selectedResult === img ? 'border-green-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="aspect-video bg-gray-100 relative">
                  {img.bakedUrl ? (
                    <img src={img.bakedUrl} className="w-full h-full object-cover" alt={`Option ${i + 1}`} />
                  ) : img.url ? (
                    <img src={img.url} className="w-full h-full object-cover" alt={`Option ${i + 1}`} />
                  ) : img.status === 'error' ? (
                    <div className="w-full h-full flex items-center justify-center text-xs text-red-500 p-2 text-center">
                      ✗ {img.error || 'Failed'}
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                      <p className="text-[10px] text-gray-500">
                        {img.status === 'polling' ? 'Generating...' : 'Queued...'}
                      </p>
                    </div>
                  )}
                  {img.bakedUrl && (
                    <div className="absolute top-1.5 left-1.5">
                      <Badge className="bg-green-500 text-white text-[9px]">Text Baked ✓</Badge>
                    </div>
                  )}
                </div>

                <div className="p-2 space-y-1.5">
                  <p className="text-[10px] font-semibold text-gray-700 text-center">Option {i + 1}</p>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={() => handleSelectAndUpload(img)}
                      disabled={!img.url || uploading}
                      className="flex-1 h-7 text-[10px] bg-green-600 hover:bg-green-700 gap-1"
                    >
                      {uploading && selectedResult === img
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</>
                        : <><CheckCircle2 className="w-3 h-3" /> Use This</>
                      }
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => handleDownload(img)}
                      disabled={!img.url}
                      className="h-7 w-7 p-0"
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedResult && !uploading && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 font-medium text-center">
              ✓ Thumbnail saved and ready for publishing!
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BUILD 3 VARIED PROMPTS FROM TEMPLATE
// ═══════════════════════════════════════════════════════════════
function buildTemplatePrompts(template, analysis, title, niche, text) {
  const subject = analysis?.key_subject || title || 'person';
  const emotion = analysis?.emotion || 'shocked';
  const base = template.imageGuide;

  const variants = [
    // Option 1 — Tight, close composition
    `1920x1080 Full HD 16:9 YouTube thumbnail, graphic design composition. ${base} IMPORTANT: Leave clean empty space in ${template.textStyle.position === 'center' ? 'the center' : template.textStyle.position.replace('_', ' ')} area where bold overlay text will be added — no background elements there. Subject: ${subject}. Emotion: ${emotion}. Cinematic dramatic lighting, ultra sharp focus, professional photography quality, high contrast. DO NOT render any text, words, letters or numbers in the image.`,
    // Option 2 — More dramatic lighting
    `1920x1080 Full HD 16:9 YouTube thumbnail, graphic design composition. ${base} Dramatic studio lighting with strong rim light and deep shadows. Subject: ${subject} with more extreme ${emotion} expression. Moody atmospheric background. High contrast cinematic color grading. Clean empty space for text overlay. NO text or words in image.`,
    // Option 3 — Different color mood
    `1920x1080 Full HD 16:9 YouTube thumbnail, graphic design composition. ${base} Warmer/cooler color temperature variant. Subject: ${subject} from slightly different angle. Background with more texture and depth. Professional editorial photography style. Empty space reserved for text. NO text, letters, or numbers visible in image.`,
  ];

  return variants;
}
