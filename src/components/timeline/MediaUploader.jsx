import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Upload, Image as ImageIcon, Music, Loader2 } from 'lucide-react';

export default function MediaUploader({ scene, onRefetch }) {
  const imageInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const [uploading, setUploading] = useState(null);

  const handleUpload = async (file, type) => {
    setUploading(type);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });

    if (type === 'image') {
      await base44.entities.Scenes.update(scene.id, {
        image_url: file_url,
        status: 'image_generated',
      });
    } else if (type === 'audio') {
      await base44.entities.Scenes.update(scene.id, {
        sound_effect_url: file_url,
      });
    }

    setUploading(null);
    onRefetch();
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files[0] && handleUpload(e.target.files[0], 'image')}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => e.target.files[0] && handleUpload(e.target.files[0], 'audio')}
      />

      <Button
        size="sm"
        variant="outline"
        onClick={() => imageInputRef.current?.click()}
        disabled={!!uploading}
        className="text-xs gap-1 h-7"
      >
        {uploading === 'image' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
        Image
      </Button>

      <Button
        size="sm"
        variant="outline"
        onClick={() => audioInputRef.current?.click()}
        disabled={!!uploading}
        className="text-xs gap-1 h-7"
      >
        {uploading === 'audio' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Music className="w-3 h-3" />}
        Audio
      </Button>
    </div>
  );
}