/**
 * OverlayPanel — Left-side panel for adding overlay clips (emoji, stickers, video overlays)
 * to the secondary overlay track above the main timeline.
 */
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Smile, Film, Plus, Trash2, Search, Sticker, Image, Upload, Loader2, X } from 'lucide-react';

const EMOJI_LIBRARY = [
  '🔥','💯','⭐','❤️','👀','😂','🎯','💰','🚀','💡',
  '👑','🏆','⚡','🎬','📈','💪','🤯','😱','✅','❌',
  '🎉','👏','💎','🌟','🫡','😎','🤑','💀','🤔','👆',
];

const STICKER_PRESETS = [
  { id: 'subscribe', label: 'Subscribe', emoji: '🔔', bg: '#EF4444', text: 'SUBSCRIBE' },
  { id: 'like',      label: 'Like',      emoji: '👍', bg: '#3B82F6', text: 'LIKE' },
  { id: 'wow',       label: 'Wow',       emoji: '🤩', bg: '#F59E0B', text: 'WOW' },
  { id: 'new',       label: 'New',       emoji: '✨', bg: '#8B5CF6', text: 'NEW' },
  { id: 'arrow_down',label: 'Arrow',     emoji: '👇', bg: '#10B981', text: '' },
  { id: 'fire',      label: 'Fire',      emoji: '🔥', bg: '#F97316', text: 'HOT' },
];

export default function OverlayPanel({ overlayClips, onAddOverlay, onRemoveOverlay, currentTime, totalDuration, projectId }) {
  const [emojiSearch, setEmojiSearch] = useState('');
  const [activeTab, setActiveTab] = useState('emoji');
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();

  const { data: uploadedAssets = [] } = useQuery({
    queryKey: ['media-assets-overlay', projectId],
    queryFn: async () => {
      const all = await base44.entities.MediaAssets.filter({ project_id: projectId, file_type: 'image', category: 'overlay' });
      return all.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    },
    enabled: !!projectId,
  });

  const handleUploadImage = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsUploading(true);
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.MediaAssets.create({
        project_id: projectId,
        file_url,
        file_type: 'image',
        filename: file.name,
        category: 'overlay',
        file_size_bytes: file.size,
      });
      queryClient.invalidateQueries({ queryKey: ['media-assets-overlay', projectId] });
      setIsUploading(false);
    };
    input.click();
  };

  const addImageOverlay = (asset) => {
    onAddOverlay({
      id: `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'overlay',
      overlayType: 'image',
      imageUrl: asset.file_url,
      content: '🖼',
      startTime: currentTime,
      duration: 5,
      x: 50,
      y: 50,
      scale: 0.3,
      opacity: 1.0,
      animation: 'fade_in',
      label: (asset.filename || 'Image').slice(0, 15),
    });
  };

  const handleDeleteAsset = async (assetId) => {
    await base44.entities.MediaAssets.delete(assetId);
    queryClient.invalidateQueries({ queryKey: ['media-assets-overlay', projectId] });
  };

  const filteredEmojis = emojiSearch
    ? EMOJI_LIBRARY.filter(() => true) // emoji search is visual, keep all
    : EMOJI_LIBRARY;

  const addEmoji = (emoji) => {
    onAddOverlay({
      id: `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'overlay',
      overlayType: 'emoji',
      content: emoji,
      startTime: currentTime,
      duration: 3,
      x: 50,
      y: 50,
      scale: 1.0,
      opacity: 1.0,
      animation: 'pop',
      label: emoji,
    });
  };

  const addSticker = (sticker) => {
    onAddOverlay({
      id: `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'overlay',
      overlayType: 'sticker',
      content: sticker.emoji,
      stickerText: sticker.text,
      stickerBg: sticker.bg,
      startTime: currentTime,
      duration: 4,
      x: 50,
      y: 30,
      scale: 1.0,
      opacity: 1.0,
      animation: 'bounce',
      label: sticker.label,
    });
  };

  const addVideoOverlay = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      onAddOverlay({
        id: `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'overlay',
        overlayType: 'video',
        videoUrl: url,
        startTime: currentTime,
        duration: 5,
        x: 75,
        y: 25,
        scale: 0.3,
        opacity: 0.9,
        animation: 'fade_in',
        label: file.name.slice(0, 15),
      });
    };
    input.click();
  };

  const tabs = [
    { id: 'emoji',   label: 'Emoji',    icon: Smile },
    { id: 'sticker', label: 'Stickers', icon: Sticker },
    { id: 'video',   label: 'Video',    icon: Film },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-gray-800">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-medium transition-colors ${
              activeTab === tab.id ? 'text-pink-400 border-b-2 border-pink-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <tab.icon size={12} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {activeTab === 'emoji' && (
          <>
            <div className="grid grid-cols-5 gap-1.5">
              {filteredEmojis.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => addEmoji(emoji)}
                  className="aspect-square rounded-lg bg-gray-800/60 hover:bg-gray-700 flex items-center justify-center text-xl transition-all hover:scale-110"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-gray-600 text-center">Click to add at playhead position</p>
          </>
        )}

        {activeTab === 'sticker' && (
          <div className="grid grid-cols-2 gap-2">
            {STICKER_PRESETS.map(sticker => (
              <button
                key={sticker.id}
                onClick={() => addSticker(sticker)}
                className="p-3 rounded-lg bg-gray-800/60 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 transition-all flex flex-col items-center gap-1"
              >
                <span className="text-2xl">{sticker.emoji}</span>
                {sticker.text && (
                  <span className="text-[9px] font-bold text-white px-2 py-0.5 rounded" style={{ backgroundColor: sticker.bg }}>
                    {sticker.text}
                  </span>
                )}
                <span className="text-[9px] text-gray-500">{sticker.label}</span>
              </button>
            ))}
          </div>
        )}

        {activeTab === 'video' && (
          <div className="space-y-3">
            <Button onClick={addVideoOverlay} variant="outline" className="w-full gap-2 border-gray-700 text-gray-300 hover:bg-gray-800">
              <Plus size={14} />
              Upload Video Overlay
            </Button>
            <p className="text-[9px] text-gray-600 text-center">
              Add transparent video clips (green screen, animated elements) that play on top of the main content.
            </p>
          </div>
        )}
      </div>

      {/* Active overlays list */}
      {overlayClips.length > 0 && (
        <div className="border-t border-gray-800 p-2 space-y-1 max-h-36 overflow-y-auto">
          <p className="text-[9px] text-gray-500 font-medium uppercase tracking-wider mb-1">Active Overlays ({overlayClips.length})</p>
          {overlayClips.map(clip => (
            <div key={clip.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-800/50 text-xs">
              <span className="text-base flex-shrink-0">{clip.content || '🎬'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-gray-300 truncate text-[10px]">{clip.label}</p>
                <p className="text-gray-600 text-[9px]">{clip.startTime.toFixed(1)}s · {clip.duration.toFixed(1)}s</p>
              </div>
              <button onClick={() => onRemoveOverlay(clip.id)} className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}