import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { FolderOpen } from 'lucide-react';

const DEFAULT_ACTS = ['Intro', 'Act 1', 'Act 2', 'Act 3', 'Outro'];

export default function ActAssigner({ scene, existingActs, onSaved }) {
  const [open, setOpen] = useState(false);
  const [customAct, setCustomAct] = useState('');

  const allActs = [...new Set([...DEFAULT_ACTS, ...existingActs])];

  const handleAssign = async (actName) => {
    await base44.entities.Scenes.update(scene.id, { act: actName });
    setOpen(false);
    onSaved?.();
  };

  const handleCustom = async () => {
    if (!customAct.trim()) return;
    await base44.entities.Scenes.update(scene.id, { act: customAct.trim() });
    setCustomAct('');
    setOpen(false);
    onSaved?.();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 text-xs hover:bg-gray-100 rounded px-1.5 py-0.5 transition-colors">
          <FolderOpen className="w-3 h-3 text-blue-500" />
          {scene.act ? (
            <span className="text-blue-700 font-medium">{scene.act}</span>
          ) : (
            <span className="text-gray-400 italic">No act</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <p className="text-xs font-medium text-gray-500 mb-2">Assign to Act</p>
        <div className="space-y-1 mb-2">
          {allActs.map(act => (
            <button
              key={act}
              className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-blue-50 transition-colors ${scene.act === act ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700'}`}
              onClick={() => handleAssign(act)}
            >
              {act}
            </button>
          ))}
          {scene.act && (
            <button
              className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-red-50 text-red-600"
              onClick={() => handleAssign('')}
            >
              Remove from act
            </button>
          )}
        </div>
        <div className="flex gap-1 border-t pt-2">
          <Input
            placeholder="Custom act..."
            value={customAct}
            onChange={(e) => setCustomAct(e.target.value)}
            className="h-7 text-xs"
            onKeyDown={(e) => e.key === 'Enter' && handleCustom()}
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={handleCustom} disabled={!customAct.trim()}>
            Add
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}