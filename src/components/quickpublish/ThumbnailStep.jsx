import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, CheckCircle2, Image, Upload, X, Wand2, Download, RefreshCw, Flame, Star } from 'lucide-react';
import ThumbnailStudio from './ThumbnailStudio';

export default function ThumbnailStep({
  projectId, thumbnails, onRefetch, selectedThumbnailUrl, onSelect,
  videoFile, videoUrl, transcript, title, niche
}) {
  const [activeTab, setActiveTab] = useState('studio'); // 'studio' | 'ai'
  const [generatingImageId, setGeneratingImageId] = useState(null);
  const [refPhotos, setRefPhotos] = useState([null, null, null]);
  const [renderingConceptId, setRenderingConceptId] = useState(null);
  const [renderError, setRenderError] = useState('');

  const sortedThumbs = [...thumbnails].sort((a, b) => (a.rank || 0) - (b.rank || 0));
  const selectedThumb = sortedThumbs.find(t => t.is_selected);
  const uploadedPhotos = refPhotos.filter(Boolean);

  const handlePhotoUpload = (index, file) => {
    const url = URL.createObjectURL(file);
    setRefPhotos(prev => { const a = [...prev]; a[index] = { file, url }; return a; });
  };
  const handlePhotoRemove = (index) => {
    setRefPhotos(prev => { const a = [...prev]; a[index] = null; return a; });
  };

  const handleGenerateImage = async (concept) => {
    setGeneratingImageId(concept.id);
    try {
      const res = await base44.functions.invoke('generateThumbnailImage', { concept_id: concept.id });
      const data = res.data;
      if (data.pending && data.task_id) {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 5000));
          const pollRes = await base44.functions.invoke('pollThumbnailTask', {
            task_id: data.task_id, concept_id: concept.id, task_type: data.task_type || 'kie',
          });
          if (pollRes.data.completed) break;
        }
      }
      await onRefetch();
    } catch (e) { console.error('Gen failed:', e.message); }
    setGeneratingImageId(null);
  };

  const handleRenderWithPhotos = async (concept) => {
    if (uploadedPhotos.length === 0) return;
    setRenderingConceptId(concept.id);
    setRenderError('');
    try {
      const resizeToBase64 = (file) => new Promise((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          const scale = Math.min(1024 / img.width, 1024 / img.height, 1);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
        };
        img.onerror = () => resolve(null);
        img.src = URL.createObjectURL(file);
      });

      const charPhotos = [];
      for (const photo of uploadedPhotos) {
        if (photo?.file) {
          const b64 = await resizeToBase64(photo.file);
          if (b64) charPhotos.push({ b64, mime: 'image/jpeg' });
        }
      }

      const res = await base44.functions.invoke('generateThumbnailImage', {
        concept_id: concept.id,
        char_photos: charPhotos.length > 0 ? charPhotos : undefined,
      });
      const data = res.data || {};

      if (data.pending && data.task_id) {
        for (let i = 0; i < 40; i++) {
          await new Promise(r => setTimeout(r, 5000));
          const poll = await base44.functions.invoke('pollThumbnailTask', {
            task_id: data.task_id, concept_id: concept.id, task_type: 'kie',
          });
          if (poll.data?.completed) break;
        }
        await onRefetch();
      } else if (data.image_url) {
        await onRefetch();
      } else {
        throw new Error(data?.error || 'No image returned');
      }
    } catch (e) {
      setRenderError(e.message);
    }
    setRenderingConceptId(null);
  };

  const handleSelect = async (concept) => {
    try {
      await Promise.all(sortedThumbs.map(t =>
        base44.entities.ThumbnailConcepts.update(t.id, { is_selected: t.id === concept.id })
      ));
      onSelect(concept.image_url);
      await onRefetch();
    } catch (e) { console.error('Select failed:', e); }
  };

  const handleDownload = async (url) => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl; a.download = 'thumbnail.png';
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (_) { window.open(url, '_blank'); }
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('studio')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
            activeTab === 'studio' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Star className="w-3.5 h-3.5" /> Thumbnail Studio
          <Badge className="bg-orange-100 text-orange-700 text-[9px] ml-1">NEW</Badge>
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
            activeTab === 'ai' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" /> AI Concepts
          {thumbnails.length > 0 && <span className="text-[10px] text-gray-400 ml-1">({thumbnails.length})</span>}
        </button>
      </div>

      {/* Studio Tab — 7-step wizard */}
      {activeTab === 'studio' && (
        <ThumbnailStudio
          transcript={transcript}
          title={title}
          niche={niche}
          projectId={projectId}
          onThumbnailReady={onSelect}
        />
      )}

      {/* AI Concepts Tab — existing pipeline */}
      {activeTab === 'ai' && thumbnails.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <Image className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">AI concepts will appear here after generation</p>
        </div>
      )}

      {activeTab === 'ai' && thumbnails.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{thumbnails.length} concepts</span>
            {selectedThumb && (
              <Badge className="bg-green-100 text-green-700 text-xs">
                <CheckCircle2 className="w-3 h-3 mr-1" /> #{selectedThumb.rank} selected
              </Badge>
            )}
          </div>

          {/* Reference photo upload */}
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-semibold text-purple-800">Upload Reference Photos</span>
            </div>
            <p className="text-[10px] text-purple-600">
              Upload key frames from your video — AI uses your actual content for better faces and accuracy
            </p>
            <div className="grid grid-cols-4 gap-2">
              {refPhotos.map((photo, i) => {
                const ref = React.createRef();
                return (
                  <div
                    key={i}
                    onClick={() => !photo && ref.current?.click()}
                    className={`relative aspect-video rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                      photo ? 'border-purple-500' : 'border-dashed border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <input ref={ref} type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(i, f); }} />
                    {photo ? (
                      <>
                        <img src={photo.url} className="w-full h-full object-cover" alt="" />
                        <button onClick={e => { e.stopPropagation(); handlePhotoRemove(i); }}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center">
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-400">
                        <Upload className="w-4 h-4" /><span className="text-[10px]">Upload</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {uploadedPhotos.length > 0 && (
              <p className="text-[10px] text-green-600 font-medium">
                ✓ {uploadedPhotos.length} photo{uploadedPhotos.length > 1 ? 's' : ''} ready
              </p>
            )}
          </div>

          {renderError && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{renderError}</div>
          )}

          {/* Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {sortedThumbs.slice(0, 10).map(concept => (
              <div key={concept.id} className={`rounded-lg border overflow-hidden transition-all ${
                concept.is_selected ? 'ring-2 ring-green-500 shadow-md' : 'hover:shadow-md'
              }`}>
                {concept.image_url ? (
                  <div>
                    <div className="relative cursor-pointer" onClick={() => handleSelect(concept)} style={{ containerType: 'inline-size' }}>
                      <img src={concept.image_url} className="w-full aspect-video object-cover" alt={`Thumb #${concept.rank}`} />
                      {concept.text_overlay && (
                        <div className="absolute inset-0 flex items-end justify-center pb-2 px-2 pointer-events-none">
                          <span className="font-black uppercase text-white text-center leading-tight"
                            style={{
                              fontSize: 'clamp(11px, 4.5cqw, 22px)',
                              textShadow: '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 3px 6px rgba(0,0,0,0.8)',
                              WebkitTextStroke: '0.5px #000',
                            }}>
                            {concept.text_overlay}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-gray-500">#{concept.rank}</span>
                        {concept.is_selected
                          ? <Badge className="bg-green-100 text-green-700 text-[10px]">Selected</Badge>
                          : <span className="text-[10px] text-blue-600 font-medium cursor-pointer" onClick={() => handleSelect(concept)}>Select</span>
                        }
                      </div>
                      <div className="flex gap-1">
                        {uploadedPhotos.length > 0 && (
                          <Button size="sm" variant="outline"
                            onClick={() => handleRenderWithPhotos(concept)}
                            disabled={renderingConceptId === concept.id}
                            className="text-[10px] h-6 gap-1 flex-1">
                            {renderingConceptId === concept.id
                              ? <><Loader2 className="w-3 h-3 animate-spin" /> Rendering...</>
                              : <><Wand2 className="w-3 h-3" /> With Photos</>}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => handleDownload(concept.image_url)} className="text-[10px] h-6 px-2">
                          <Download className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video bg-gray-100 flex flex-col items-center justify-center p-3">
                    {generatingImageId === concept.id || renderingConceptId === concept.id ? (
                      <>
                        <Loader2 className="w-6 h-6 text-purple-500 animate-spin mb-2" />
                        <p className="text-[10px] text-gray-500">Generating...</p>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 w-full">
                        {concept.text_overlay && (
                          <p className="text-[10px] font-bold text-gray-600 text-center px-2 line-clamp-2">{concept.text_overlay}</p>
                        )}
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => handleGenerateImage(concept)} className="text-xs gap-1">
                            <Sparkles className="w-3 h-3" /> Generate
                          </Button>
                          {uploadedPhotos.length > 0 && (
                            <Button size="sm" variant="default" onClick={() => handleRenderWithPhotos(concept)}
                              className="text-xs gap-1 bg-purple-600 hover:bg-purple-700">
                              <Wand2 className="w-3 h-3" /> Photos
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
