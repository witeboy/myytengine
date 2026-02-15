import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Upload, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export default function MediaUploadZone({ onClose, onUploaded }) {
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [category, setCategory] = useState('other');
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState(0);

  const handleFiles = (e) => {
    const selected = Array.from(e.target.files);
    setFiles(prev => [...prev, ...selected]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...dropped]);
  };

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const getFileType = (file) => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'image';
  };

  const handleUpload = async () => {
    setUploading(true);
    setResults([]);
    const total = files.length;

    for (let i = 0; i < total; i++) {
      const file = files[i];
      setProgress(Math.round(((i) / total) * 100));
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.MediaAssets.create({
        file_url,
        file_type: getFileType(file),
        filename: file.name,
        category,
        file_size_bytes: file.size,
      });
      setResults(prev => [...prev, { name: file.name, success: true }]);
    }

    setProgress(100);
    setUploading(false);
    setFiles([]);
    onUploaded?.();
  };

  return (
    <Card className="mb-6 border-blue-200 bg-blue-50/50">
      <CardContent className="p-4 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-sm">Bulk Upload</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          <Upload className="w-8 h-8 text-blue-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Drop files here or click to browse</p>
          <p className="text-xs text-gray-400 mt-1">Images, videos, or audio files</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*"
            className="hidden"
            onChange={handleFiles}
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{files.length} files selected</p>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scene_image">Scene Image</SelectItem>
                  <SelectItem value="scene_video">Scene Video</SelectItem>
                  <SelectItem value="background">Background</SelectItem>
                  <SelectItem value="overlay">Overlay</SelectItem>
                  <SelectItem value="music">Music</SelectItem>
                  <SelectItem value="sfx">Sound Effect</SelectItem>
                  <SelectItem value="reference">Reference</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between bg-white rounded px-2 py-1 text-xs">
                  <span className="truncate flex-1">{f.name}</span>
                  <span className="text-gray-400 mx-2">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeFile(i)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress */}
        {uploading && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Results */}
        {results.length > 0 && !uploading && (
          <div className="space-y-1">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-green-700">
                <CheckCircle className="w-3 h-3" /> {r.name}
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && !uploading && (
          <Button onClick={handleUpload} className="w-full bg-blue-600 hover:bg-blue-700">
            <Upload className="w-4 h-4 mr-2" /> Upload {files.length} Files
          </Button>
        )}
      </CardContent>
    </Card>
  );
}