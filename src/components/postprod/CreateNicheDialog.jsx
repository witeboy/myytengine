import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';

const EMOJI_SUGGESTIONS = ['🏆', '📖', '💰', '💪', '🔥', '🔍', '💻', '📚', '🎬', '🎵', '🎮', '🍳', '✈️', '🏠', '💄', '🧠', '⚡', '🎯', '🌍', '❤️'];

export default function CreateNicheDialog({ open, onOpenChange, onCreated }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📁');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await base44.entities.ThumbnailNiches.create({
      name: name.trim(),
      icon,
      description: description.trim(),
      template_count: 0,
    });
    setSaving(false);
    setName('');
    setIcon('📁');
    setDescription('');
    onCreated?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Create Niche</h2>
          <p className="text-sm text-gray-500">
            Create a niche category, then feed it world-class thumbnails to teach AI that style.
          </p>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Niche Name *</label>
            <Input
              placeholder="e.g. Sports, Storytelling, Finance..."
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Icon</label>
            <div className="flex gap-1.5 flex-wrap">
              {EMOJI_SUGGESTIONS.map(e => (
                <button
                  key={e}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                    icon === e ? 'bg-amber-200 ring-2 ring-amber-400 scale-110' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                  onClick={() => setIcon(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Description (optional)</label>
            <Textarea
              placeholder="What kind of thumbnails belong in this niche? e.g. 'High-energy sports highlights with dramatic faces and bold text'"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="min-h-[80px] text-sm"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !name.trim()} className="gap-1.5 bg-amber-600 hover:bg-amber-700">
              <Plus className="w-3.5 h-3.5" /> Create Niche
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}