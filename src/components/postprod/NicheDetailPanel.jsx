import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Loader2, Plus, Trash2, Eye, Star, StarOff, Dna, Image as ImageIcon,
  Link2, Upload, X, CheckCircle2
} from 'lucide-react';
import TemplateDetailModal from './TemplateDetailModal';

export default function NicheDetailPanel({ niche, open, onOpenChange, onUpdate }) {
  const [urls, setUrls] = useState(['']);
  const [nicheTags, setNicheTags] = useState('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, results: [] });
  const [synthesizing, setSynthesizing] = useState(false);
  const [detailTemplate, setDetailTemplate] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const { data: templates = [], refetch } = useQuery({
    queryKey: ['niche-templates', niche?.id],
    queryFn: () => base44.entities.ThumbnailTemplates.filter({ niche_id: niche.id }),
    enabled: !!niche?.id,
  });

  const addUrl = () => setUrls([...urls, '']);
  const removeUrl = (i) => setUrls(urls.filter((_, idx) => idx !== i));
  const updateUrl = (i, val) => { const u = [...urls]; u[i] = val; setUrls(u); };

  const handleFeedAll = async () => {
    const validUrls = urls.filter(u => u.trim());
    if (validUrls.length === 0) return;
    
    setProcessing(true);
    setProgress({ current: 0, total: validUrls.length, results: [] });

    const results = [];
    for (let i = 0; i < validUrls.length; i++) {
      setProgress(p => ({ ...p, current: i + 1 }));
      try {
        let imageUrl = validUrls[i].trim();
        if (imageUrl.includes('youtube.com') || imageUrl.includes('youtu.be')) {
          let videoId = '';
          if (imageUrl.includes('youtu.be/')) videoId = imageUrl.split('youtu.be/')[1].split('?')[0];
          else if (imageUrl.includes('v=')) videoId = imageUrl.split('v=')[1].split('&')[0];
          else if (imageUrl.includes('/shorts/')) videoId = imageUrl.split('/shorts/')[1].split('?')[0];
          if (videoId) {
            imageUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
            try {
              const test = await fetch(imageUrl, { method: 'HEAD' });
              if (!test.ok) imageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            } catch { imageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`; }
          }
        }
        const res = await base44.functions.invoke('analyzeThumbnailTemplate', {
          image_url: imageUrl,
          source_url: validUrls[i].trim(),
          niche_tags: nicheTags,
          niche_id: niche.id,
        });
        results.push({ url: validUrls[i], success: true, template: res.data.template });
      } catch (err) {
        results.push({ url: validUrls[i], success: false, error: err.message });
      }
      setProgress(p => ({ ...p, results }));
      if (i < validUrls.length - 1) await new Promise(r => setTimeout(r, 2000));
    }

    setProcessing(false);
    setUrls(['']);
    refetch();
    // Update niche template count
    await base44.entities.ThumbnailNiches.update(niche.id, {
      template_count: templates.length + results.filter(r => r.success).length,
    });
  };

  const handleSynthesizeDna = async () => {
    setSynthesizing(true);
    await base44.functions.invoke('synthesizeNicheDna', { niche_id: niche.id });
    setSynthesizing(false);
    onUpdate?.();
  };

  const handleDeleteTemplate = async (t) => {
    setDeleting(t.id);
    await base44.entities.ThumbnailTemplates.delete(t.id);
    await base44.entities.ThumbnailNiches.update(niche.id, {
      template_count: Math.max(0, (niche.template_count || templates.length) - 1),
    });
    refetch();
    setDeleting(null);
  };

  const handleDeleteNiche = async () => {
    for (const t of templates) {
      await base44.entities.ThumbnailTemplates.delete(t.id);
    }
    await base44.entities.ThumbnailNiches.delete(niche.id);
    onUpdate?.();
    onOpenChange(false);
  };

  const handleUploadImage = async (file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setUrls(prev => [...prev.filter(u => u.trim()), file_url, '']);
  };

  const successCount = progress.results.filter(r => r.success).length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{niche.icon || '📁'}</span>
                <div>
                  <h2 className="text-lg font-bold">{niche.name}</h2>
                  <p className="text-xs text-gray-500">{templates.length} templates • {niche.description || 'No description'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-purple-700 border-purple-200 hover:bg-purple-50"
                  onClick={handleSynthesizeDna}
                  disabled={synthesizing || templates.length === 0}
                >
                  {synthesizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Dna className="w-3.5 h-3.5" />}
                  {synthesizing ? 'Synthesizing...' : niche.synthesized_dna ? 'Re-synthesize DNA' : 'Synthesize Style DNA'}
                </Button>
                <Button size="sm" variant="destructive" className="gap-1" onClick={handleDeleteNiche}>
                  <Trash2 className="w-3 h-3" /> Delete Niche
                </Button>
              </div>
            </div>

            {/* DNA Status */}
            {niche.synthesized_dna && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Dna className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-semibold text-purple-800">Style DNA Synthesized</span>
                  <Badge className="bg-purple-100 text-purple-700 text-[10px]">
                    from {niche.template_count || templates.length} thumbnails
                  </Badge>
                </div>
                <p className="text-xs text-purple-700 whitespace-pre-wrap max-h-[200px] overflow-y-auto leading-relaxed">
                  {niche.synthesized_dna.substring(0, 800)}...
                </p>
              </div>
            )}

            {/* Feed URLs */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">Feed Thumbnails into this Niche</p>
              <div className="space-y-2">
                {urls.map((url, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      placeholder={`YouTube URL or image URL #${i + 1}...`}
                      value={url}
                      onChange={e => updateUrl(i, e.target.value)}
                      className="flex-1 text-sm bg-white"
                      disabled={processing}
                    />
                    {urls.length > 1 && (
                      <Button variant="ghost" size="icon" className="shrink-0" onClick={() => removeUrl(i)} disabled={processing}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={addUrl} disabled={processing}>
                    <Plus className="w-3 h-3" /> Add URL
                  </Button>
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleUploadImage(e.target.files[0]); }} disabled={processing} />
                    <Button variant="outline" size="sm" className="gap-1 text-xs" asChild>
                      <span><Upload className="w-3 h-3" /> Upload</span>
                    </Button>
                  </label>
                  <Button
                    size="sm"
                    onClick={handleFeedAll}
                    disabled={processing || urls.filter(u => u.trim()).length === 0}
                    className="ml-auto gap-1.5 bg-amber-600 hover:bg-amber-700"
                  >
                    {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Dna className="w-3.5 h-3.5" />}
                    {processing ? `Analyzing ${progress.current}/${progress.total}...` : `Analyze & Feed`}
                  </Button>
                </div>
              </div>

              {processing && (
                <div className="w-full bg-amber-200 rounded-full h-2">
                  <div className="bg-amber-600 h-2 rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                </div>
              )}

              {progress.results.length > 0 && !processing && (
                <div className="space-y-1">
                  {progress.results.map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs p-1.5 rounded ${r.success ? 'bg-green-50' : 'bg-red-50'}`}>
                      {r.success ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <X className="w-3 h-3 text-red-500" />}
                      <span className="truncate flex-1">{r.url}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Existing templates grid */}
            {templates.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Templates in this Niche ({templates.length})</p>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {templates.map(t => (
                    <div key={t.id} className="relative group rounded-lg overflow-hidden border">
                      <div className="aspect-video bg-gray-100">
                        {t.thumbnail_image_url ? (
                          <img src={t.thumbnail_image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <ImageIcon className="w-5 h-5" />
                          </div>
                        )}
                      </div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                        <Button size="sm" variant="secondary" className="h-6 px-2 text-[10px]" onClick={() => setDetailTemplate(t)}>
                          <Eye className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="destructive" className="h-6 px-2 text-[10px]" onClick={() => handleDeleteTemplate(t)} disabled={deleting === t.id}>
                          {deleting === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </Button>
                      </div>
                      <Badge className="absolute bottom-1 left-1 text-[8px] px-1 py-0 bg-black/60 text-white">
                        {(t.template_type || '').replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <TemplateDetailModal template={detailTemplate} open={!!detailTemplate} onOpenChange={o => { if (!o) setDetailTemplate(null); }} />
    </>
  );
}