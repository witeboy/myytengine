import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Download, Image, Film, Music } from 'lucide-react';

export default function MediaPreviewModal({ asset, onClose }) {
  if (!asset) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = asset.file_url;
    a.download = asset.filename || 'download';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            {asset.file_type === 'image' ? <Image className="w-4 h-4 text-green-600" /> :
             asset.file_type === 'video' ? <Film className="w-4 h-4 text-purple-600" /> :
             <Music className="w-4 h-4 text-amber-600" />}
            <h3 className="font-medium text-sm">{asset.filename || 'Preview'}</h3>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5 mr-1" /> Download
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="p-4">
          {asset.file_type === 'image' && (
            <img src={asset.file_url} alt={asset.filename} className="w-full max-h-[60vh] object-contain rounded-lg" />
          )}
          {asset.file_type === 'video' && (
            <video src={asset.file_url} controls className="w-full max-h-[60vh] rounded-lg" />
          )}
          {asset.file_type === 'audio' && (
            <div className="py-12 flex items-center justify-center">
              <audio src={asset.file_url} controls className="w-full max-w-md" />
            </div>
          )}
        </div>

        <div className="px-4 pb-4 flex flex-wrap gap-2 text-xs text-gray-500">
          <Badge variant="outline" className="capitalize">{asset.file_type}</Badge>
          <Badge variant="outline" className="capitalize">{(asset.category || 'other').replace(/_/g, ' ')}</Badge>
          {asset.file_size_bytes && (
            <Badge variant="outline">{(asset.file_size_bytes / 1024 / 1024).toFixed(1)} MB</Badge>
          )}
          {asset.tags && asset.tags.split(',').map((tag, i) => (
            <Badge key={i} className="bg-blue-50 text-blue-600 text-[10px]">{tag.trim()}</Badge>
          ))}
        </div>
      </div>
    </div>
  );
}