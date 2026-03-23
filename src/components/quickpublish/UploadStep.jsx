import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileVideo, X } from 'lucide-react';

export default function UploadStep({ videoFile, onFileSelect, onClear }) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      onFileSelect(file);
    }
  };

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
      {videoFile ? (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
          <FileVideo className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{videoFile.name}</p>
            <p className="text-xs text-gray-500">{(videoFile.size / 1048576).toFixed(1)} MB</p>
          </div>
          <button onClick={onClear} className="text-gray-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full p-10 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors text-center"
        >
          <Upload className="w-8 h-8 mx-auto text-gray-400 mb-3" />
          <p className="text-sm font-medium text-gray-600">Click to upload your video</p>
          <p className="text-xs text-gray-400 mt-1">.mp4, .mov, .webm — any video not produced in the app</p>
        </button>
      )}
    </div>
  );
}