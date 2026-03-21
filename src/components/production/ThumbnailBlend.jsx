import React, { useState, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import {
  ArrowLeft, Upload, X, Sparkles, Loader2, Download,
  RefreshCw, Image as ImageIcon, User, Layers, Mountain,
  Package, Plus, CheckCircle, AlertCircle, PenLine
} from 'lucide-react';

function ImageSlot({ label, icon: Icon, imageUrl, onUpload, onRemove, onUrlAdd, acceptUrl }) {
  const ref = useRef(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div
        onClick={() => !imageUrl && ref.current?.click()}
        style={{
          border: imageUrl ? '2px solid #7c3aed' : '2px dashed #374151',
          borderRadius: 10, overflow: 'hidden', aspectRatio: '16/9',
          background: imageUrl ? '#000' : '#0f172a', cursor: imageUrl ? 'default' : 'pointer',
          position: 'relative', minHeight: 90,
        }}
      >
        <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
        {imageUrl ? (
          <>
            <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button onClick={e => { e.stopPropagation(); onRemove(); }}
              style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={12} />
            </button>
          </>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#4b5563', padding: 8 }}>
            <Icon size={20} />
            <div style={{ fontSize: 10, textAlign: 'center' }}>Click to upload</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ThumbnailBlend({ onBack, generatedThumbnailUrl, videoTitle, conceptId, sceneImages = [], uploadedCharPhotos = [] }) {
  const [referenceUrl] = useState(generatedThumbnailUrl || '');
  const [faceImages, setFaceImages] = useState([]);
  const [objectImages, setObjectImages] = useState([]);
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');

  const [blending, setBlending] = useState(false);
  const [blendPhase, setBlendPhase] = useState('');
  const [blendedUrl, setBlendedUrl] = useState(null);
  const [error, setError] = useState(null);

  // Upload a file and get a blob URL (for preview) + the actual uploaded URL
  const uploadFile = async (file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    return file_url;
  };

  const handleAddFace = async (file) => {
    const url = await uploadFile(file);
    setFaceImages(prev => [...prev, url]);
  };

  const handleAddObject = async (file) => {
    const url = await uploadFile(file);
    setObjectImages(prev => [...prev, url]);
  };

  const handleAddBackground = async (file) => {
    const url = await uploadFile(file);
    setBackgroundUrl(url);
  };

  // Add scene image as face reference
  const addSceneAsFace = (url) => {
    if (!faceImages.includes(url)) setFaceImages(prev => [...prev, url]);
  };

  const addSceneAsObject = (url) => {
    if (!objectImages.includes(url)) setObjectImages(prev => [...prev, url]);
  };

  // Poll helper
  const pollForBlendResult = async (taskId) => {
    const maxAttempts = 40;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await base44.functions.invoke('pollThumbnailBlend', { task_id: taskId, concept_id: conceptId });
        const data = res?.data ?? res;
        if (data?.completed) {
          if (data?.image_url) return { image_url: data.image_url };
          return { error: data?.error || 'Blend failed' };
        }
        setBlendPhase(`AI33 SeedDream processing... (attempt ${i + 1})`);
      } catch (e) {
        console.warn('Poll error:', e.message);
      }
    }
    return { error: 'Blend timed out.' };
  };

  const handleBlend = async () => {
    if (!referenceUrl) return;
    setBlending(true);
    setError(null);
    setBlendedUrl(null);
    setBlendPhase('Submitting blend request to AI33 SeedDream...');

    try {
      const raw = await base44.functions.invoke('thumbnailBlend', {
        reference_image_url: referenceUrl,
        face_images: faceImages,
        object_images: objectImages,
        background_image_url: backgroundUrl || undefined,
        video_title: videoTitle || '',
        custom_instructions: customInstructions || '',
        concept_id: conceptId || undefined,
      });

      const result = raw?.data ?? raw;

      if (result?.image_url) {
        setBlendedUrl(result.image_url);
      } else if (result?.pending && result?.task_id) {
        setBlendPhase('Blend in progress, polling for result...');
        const pollResult = await pollForBlendResult(result.task_id);
        if (pollResult?.image_url) {
          setBlendedUrl(pollResult.image_url);
        } else {
          throw new Error(pollResult?.error || 'Blend timed out.');
        }
      } else if (result?.error) {
        throw new Error(result.error);
      } else {
        throw new Error('No result from blend. Check function logs.');
      }
    } catch (e) {
      console.error('Blend error:', e);
      setError(e.message);
    }

    setBlending(false);
    setBlendPhase('');
  };

  const handleDownload = async () => {
    const url = blendedUrl;
    if (!url) return;
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `blend-${(videoTitle || 'thumbnail').replace(/\s+/g, '-').toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (_) {
      window.open(url, '_blank');
    }
  };

  // Available source images (scene images + uploaded char photos)
  const availableSources = [
    ...sceneImages.map(s => ({ url: s.image_url, label: `Scene ${s.scene_number}` })),
    ...uploadedCharPhotos.filter(Boolean).map((u, i) => ({ url: u.url || u.remoteUrl || u, label: `Photo ${i + 1}` })),
  ].filter(s => s.url);

  return (
    <div style={{ minHeight: '100vh', background: '#070711', color: '#fff' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1f2937', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <ArrowLeft size={15} /> Back
          </button>
          <div style={{ width: 1, height: 20, background: '#1f2937' }} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>🎨 Thumbnail Blend</div>
        </div>
        {blendedUrl && (
          <button onClick={handleDownload} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={13} /> Download
          </button>
        )}
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
        {/* Title */}
        {videoTitle && (
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
            Blending thumbnail for: <strong style={{ color: '#a78bfa' }}>{videoTitle}</strong>
          </div>
        )}

        {/* Reference Image (the generated thumbnail) */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Reference Image (Generated Thumbnail)
          </div>
          {referenceUrl ? (
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '2px solid #7c3aed', maxHeight: 320 }}>
              <img src={referenceUrl} alt="Reference" style={{ width: '100%', display: 'block', objectFit: 'contain', maxHeight: 320, background: '#0f172a' }} />
            </div>
          ) : (
            <div style={{ background: '#0f172a', border: '2px dashed #374151', borderRadius: 12, padding: 40, textAlign: 'center', color: '#4b5563' }}>
              <AlertCircle size={24} style={{ margin: '0 auto 8px' }} />
              <div>No reference image provided</div>
            </div>
          )}
        </div>

        {/* Source Images Picker */}
        {availableSources.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Available Source Images <span style={{ color: '#6b7280', fontWeight: 400, textTransform: 'none' }}>(click to assign)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
              {availableSources.map((src, i) => {
                const isFace = faceImages.includes(src.url);
                const isObj = objectImages.includes(src.url);
                const isBg = backgroundUrl === src.url;
                const isUsed = isFace || isObj || isBg;
                return (
                  <div key={i} style={{ position: 'relative' }}>
                    <div style={{
                      borderRadius: 8, overflow: 'hidden', aspectRatio: '16/9',
                      border: isUsed ? '2px solid #22c55e' : '2px solid #1f2937',
                      opacity: isUsed ? 1 : 0.7,
                    }}>
                      <img src={src.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ fontSize: 9, color: '#6b7280', textAlign: 'center', marginTop: 2 }}>{src.label}</div>
                    {isUsed && (
                      <div style={{ position: 'absolute', top: 2, right: 2, background: '#22c55e', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircle size={10} color="#fff" />
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 3, marginTop: 3, justifyContent: 'center' }}>
                      <button onClick={() => addSceneAsFace(src.url)} disabled={isFace}
                        style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, border: 'none', background: isFace ? '#22c55e' : '#1f2937', color: '#fff', cursor: 'pointer' }}>
                        Face
                      </button>
                      <button onClick={() => addSceneAsObject(src.url)} disabled={isObj}
                        style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, border: 'none', background: isObj ? '#22c55e' : '#1f2937', color: '#fff', cursor: 'pointer' }}>
                        Object
                      </button>
                      <button onClick={() => setBackgroundUrl(src.url)} disabled={isBg}
                        style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, border: 'none', background: isBg ? '#22c55e' : '#1f2937', color: '#fff', cursor: 'pointer' }}>
                        BG
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Input slots grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          {/* Face images */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <User size={14} /> Face / Character ({faceImages.length})
            </div>
            {faceImages.map((url, i) => (
              <div key={i} style={{ position: 'relative', marginBottom: 8, borderRadius: 8, overflow: 'hidden', border: '1px solid #374151' }}>
                <img src={url} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                <button onClick={() => setFaceImages(prev => prev.filter((_, j) => j !== i))}
                  style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={10} />
                </button>
              </div>
            ))}
            <ImageSlot label="Add face photo" icon={User} onUpload={handleAddFace} onRemove={() => {}} />
          </div>

          {/* Background */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mountain size={14} /> Background
            </div>
            <ImageSlot
              label={backgroundUrl ? 'Background set' : 'Add background'}
              icon={Mountain}
              imageUrl={backgroundUrl}
              onUpload={handleAddBackground}
              onRemove={() => setBackgroundUrl('')}
            />
          </div>

          {/* Object images */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Package size={14} /> Objects / Props ({objectImages.length})
            </div>
            {objectImages.map((url, i) => (
              <div key={i} style={{ position: 'relative', marginBottom: 8, borderRadius: 8, overflow: 'hidden', border: '1px solid #374151' }}>
                <img src={url} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                <button onClick={() => setObjectImages(prev => prev.filter((_, j) => j !== i))}
                  style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={10} />
                </button>
              </div>
            ))}
            <ImageSlot label="Add object/prop" icon={Package} onUpload={handleAddObject} onRemove={() => {}} />
          </div>
        </div>

        {/* Custom instructions */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <PenLine size={14} /> Custom Instructions (optional)
          </div>
          <textarea
            value={customInstructions}
            onChange={e => setCustomInstructions(e.target.value)}
            placeholder="e.g. Make the lighting warmer, add more contrast, replace money with stacked t-shirts..."
            rows={2}
            style={{ width: '100%', padding: '10px 14px', background: '#0f172a', border: '1px solid #1f2937', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        {/* Blend button */}
        <button
          onClick={handleBlend}
          disabled={blending || !referenceUrl}
          style={{
            width: '100%', padding: '15px', borderRadius: 12, border: 'none',
            background: blending ? '#374151' : 'linear-gradient(135deg, #7c3aed, #2563eb)',
            color: '#fff', cursor: blending ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginBottom: 24,
          }}
        >
          {blending
            ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> {blendPhase || 'Blending...'}</>
            : <><Sparkles size={16} /> Blend Thumbnail with AI33 SeedDream</>
          }
        </button>

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#fca5a5', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Result Preview */}
        {blendedUrl && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>✨ Blended Result</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleBlend} disabled={blending}
                  style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #1f2937', background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <RefreshCw size={12} /> Re-blend
                </button>
                <button onClick={handleDownload}
                  style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Download size={12} /> Download
                </button>
              </div>
            </div>
            <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>
              <img src={blendedUrl} alt="Blended thumbnail" style={{ width: '100%', display: 'block' }} />
            </div>

            {/* Before/After comparison */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Before → After</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #1f2937' }}>
                  <div style={{ fontSize: 9, color: '#6b7280', padding: '4px 8px', background: '#0f172a', textAlign: 'center' }}>BEFORE (Original)</div>
                  <img src={referenceUrl} alt="Before" style={{ width: '100%', display: 'block' }} />
                </div>
                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #7c3aed' }}>
                  <div style={{ fontSize: 9, color: '#a78bfa', padding: '4px 8px', background: '#0f172a', textAlign: 'center' }}>AFTER (Blended)</div>
                  <img src={blendedUrl} alt="After" style={{ width: '100%', display: 'block' }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}