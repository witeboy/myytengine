import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import VideoPreview from './VideoPreview.jsx';

export default function UploadStep({ videoFile, onFileSelect, onClear }) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      onFileSelect(file);
    }
    // Reset input so same file can be re-selected after clear
    if (e.target) e.target.value = '';
  };

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
      {videoFile ? (
        <VideoPreview videoFile={videoFile} onClear={onClear} />
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