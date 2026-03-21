import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, X, Image, Loader2 } from 'lucide-react';

export default function BulkProductUploader({ images, setImages }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = React.useState(false);

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    const newImages = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      newImages.push({ url: file_url, name: file.name });
    }

    setImages(prev => [...prev, ...newImages]);
    setUploading(false);
  };

  const removeImage = (idx) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-600">Product Images</h3>
        <Badge variant="outline">{images.length} uploaded</Badge>
      </div>

      <div
        className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-indigo-300 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" /> Uploading...
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">Drop product images or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">Upload multiple images at once</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {images.map((img, idx) => (
            <div key={idx} className="relative group rounded-lg overflow-hidden border aspect-square bg-gray-50">
              <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(idx)}
                className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
              <div className="absolute bottom-0 inset-x-0 bg-black/50 px-1 py-0.5">
                <p className="text-[9px] text-white truncate">{img.name}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}