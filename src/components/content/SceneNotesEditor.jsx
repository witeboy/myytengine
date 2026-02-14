import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Check, X } from 'lucide-react';

export default function SceneNotesEditor({ scene, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(scene.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.Scenes.update(scene.id, { notes });
    setSaving(false);
    setEditing(false);
    onSaved?.();
  };

  if (!editing) {
    return (
      <div
        className="flex items-start gap-1.5 cursor-pointer group"
        onClick={() => setEditing(true)}
      >
        <MessageSquare className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
        {scene.notes ? (
          <p className="text-xs text-gray-500 line-clamp-2 group-hover:text-gray-700">{scene.notes}</p>
        ) : (
          <p className="text-xs text-gray-400 group-hover:text-gray-600 italic">Add notes...</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add notes about this scene..."
        className="text-xs h-16 resize-none"
        autoFocus
      />
      <div className="flex gap-1 justify-end">
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setEditing(false); setNotes(scene.notes || ''); }}>
          <X className="w-3 h-3" />
        </Button>
        <Button size="sm" className="h-6 px-2 text-xs bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving}>
          <Check className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}