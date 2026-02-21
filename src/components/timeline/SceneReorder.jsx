import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ArrowUp, ArrowDown, Loader2, GripVertical, Trash2 } from 'lucide-react';

export default function SceneReorder({ scenes, onRefetch }) {
  const [moving, setMoving] = useState(null);

  if (!scenes?.length) return null;

  const swap = async (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= scenes.length) return;

    const a = scenes[idx];
    const b = scenes[target];
    setMoving(a.id);

    await Promise.all([
      base44.entities.Scenes.update(a.id, { scene_number: b.scene_number }),
      base44.entities.Scenes.update(b.id, { scene_number: a.scene_number }),
    ]);
    onRefetch?.();
    setMoving(null);
  };

  const handleDelete = async (scene) => {
    if (!confirm(`Delete Scene ${scene.scene_number}?`)) return;
    setMoving(scene.id);
    await base44.entities.Scenes.delete(scene.id);
    onRefetch?.();
    setMoving(null);
  };

  return (
    <div className="bg-white border rounded-lg p-3 space-y-1">
      <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
        <GripVertical className="w-3.5 h-3.5" /> Reorder Scenes
      </p>
      {scenes.map((s, idx) => (
        <div key={s.id} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${moving === s.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
          <span className="text-gray-400 w-5 text-center">{s.scene_number}</span>
          {s.image_url && s.image_url.startsWith('http') ? (
            <img src={s.image_url} className="w-8 h-5 rounded object-cover flex-shrink-0" alt="" />
          ) : (
            <div className="w-8 h-5 rounded bg-gray-200 flex-shrink-0" />
          )}
          <span className="flex-1 truncate text-gray-700">{s.narration_text?.substring(0, 40) || `Scene ${s.scene_number}`}</span>
          <span className="text-gray-400">{s.duration_seconds}s</span>
          {moving === s.id ? (
            <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
          ) : (
            <div className="flex gap-0.5">
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => swap(idx, -1)} disabled={idx === 0}>
                <ArrowUp className="w-3 h-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => swap(idx, 1)} disabled={idx === scenes.length - 1}>
                <ArrowDown className="w-3 h-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-5 w-5 text-red-400 hover:text-red-600" onClick={() => handleDelete(s)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}