import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Link2, Upload, Plus, X, CheckCircle2, Image as ImageIcon } from 'lucide-react';

export default function TemplateFeedDialog({ open, onOpenChange, onComplete }) {
  const [mode, setMode] = useState('youtube'); // 'youtube' | 'upload'
  const [urls, setUrls] = useState(['']);
  const [niche, setNiche] = useState('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, results: [] });

  const addUrl = () => setUrls([...urls, '']);
  const removeUrl = (i) => setUrls(urls.filter((_, idx) => idx !== i));
  const updateUrl = (i, val) => { const u = [...urls]; u[i] = val; setUrls(u); };

  const handleProcessAll = async () => {
    const validUrls = urls.filter(u => u.trim());
    if (validUrls.length === 0) return;
    
    setProcessing(true);
    setProgress({ current: 0, total: validUrls.length, results: [] });

    const results = [];
    for (let i = 0; i < validUrls.length; i++) {
      setProgress(p => ({ ...p, current: i + 1 }));
      
      try {
        let imageUrl = validUrls[i].trim();
        
        // If YouTube URL, extract thumbnail
        if (imageUrl.includes('youtube.com') || imageUrl.includes('youtu.be')) {
          let videoId = '';
          if (imageUrl.includes('youtu.be/')) videoId = imageUrl.split('youtu.be/')[1].split('?')[0];
          else if (imageUrl.includes('v=')) videoId = imageUrl.split('v=')[1].split('&')[0];
          else if (imageUrl.includes('/shorts/')) videoId = imageUrl.split('/shorts/')[1].split('?')[0];
          
          if (videoId) {
            imageUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
            // Test if maxres exists
            try {
              const test = await fetch(imageUrl, { method: 'HEAD' });
              if (!test.ok) imageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            } catch {
              imageUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            }
          }
        }

        const res = await base44.functions.invoke('analyzeThumbnailTemplate', {
          image_url: imageUrl,
          source_url: validUrls[i].trim(),
          niche_tags: niche,
        });
        
        results.push({ url: validUrls[i], success: true, template: res.data.template });
      } catch (err) {
        results.push({ url: validUrls[i], success: false, error: err.message });
      }
      
      setProgress(p => ({ ...p, results }));
      
      // Brief pause between calls to avoid rate limiting
      if (i < validUrls.length - 1) await new Promise(r => setTimeout(r, 2000));
    }

    setProcessing(false);
    onComplete?.();
  };

  const handleUploadImage = async (file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setUrls(prev => [...prev.filter(u => u.trim()), file_url, '']);
  };

  const successCount = progress.results.filter(r => r.success).length;
  const failCount = progress.results.filter(r => !r.success).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold">Feed World-Class Thumbnails</h2>
            <p className="text-sm text-gray-500">
              Paste YouTube URLs or image URLs. AI will analyze each one and extract reusable composition templates.
            </p>
          </div>

          {/* Niche tags */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Niche tags (optional)</label>
            <Input
              placeholder="e.g. true crime, history, drama"
              value={niche}
              onChange={e => setNiche(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* URL inputs */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 flex items-center gap-2">
              <Link2 className="w-3 h-3" /> YouTube or Image URLs
            </label>
            {urls.map((url, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder={`Paste YouTube URL or image URL #${i + 1}...`}
                  value={url}
                  onChange={e => updateUrl(i, e.target.value)}
                  className="flex-1 text-sm"
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
                <Plus className="w-3 h-3" /> Add Another URL
              </Button>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleUploadImage(e.target.files[0]); }}
                  disabled={processing}
                />
                <Button variant="outline" size="sm" className="gap-1 text-xs" asChild disabled={processing}>
                  <span><Upload className="w-3 h-3" /> Upload Image</span>
                </Button>
              </label>
            </div>
          </div>

          {/* Progress */}
          {processing && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span className="text-sm font-medium text-blue-800">
                  Analyzing thumbnail {progress.current} of {progress.total}...
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Results */}
          {progress.results.length > 0 && !processing && (
            <div className="space-y-2">
              <div className="flex gap-2 items-center">
                <Badge className="bg-green-100 text-green-700">{successCount} analyzed</Badge>
                {failCount > 0 && <Badge className="bg-red-100 text-red-700">{failCount} failed</Badge>}
              </div>
              {progress.results.map((r, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs p-2 rounded ${r.success ? 'bg-green-50' : 'bg-red-50'}`}>
                  {r.success ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <X className="w-3.5 h-3.5 text-red-500" />}
                  <span className="truncate flex-1">{r.url}</span>
                  {r.success && <Badge className="text-[9px] bg-green-100 text-green-700">{r.template?.template_type}</Badge>}
                  {!r.success && <span className="text-red-500 text-[10px]">{r.error?.substring(0, 50)}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
              {progress.results.length > 0 && !processing ? 'Done' : 'Cancel'}
            </Button>
            {(!progress.results.length || processing) && (
              <Button
                onClick={handleProcessAll}
                disabled={processing || urls.filter(u => u.trim()).length === 0}
                className="gap-2 bg-amber-600 hover:bg-amber-700"
              >
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                Analyze {urls.filter(u => u.trim()).length} Thumbnail{urls.filter(u => u.trim()).length !== 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}