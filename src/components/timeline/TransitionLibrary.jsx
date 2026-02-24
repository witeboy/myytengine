import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

const TRANSITIONS = [
  { id: 'cut', label: 'Cut', icon: '✂️', category: 'basic', description: 'Instant switch' },
  { id: 'fade', label: 'Fade', icon: '🌑', category: 'basic', description: 'Fade through black' },
  { id: 'dissolve', label: 'Dissolve', icon: '💫', category: 'smooth', description: 'Cross dissolve blend' },
  { id: 'zoom', label: 'Zoom', icon: '🔍', category: 'cinematic', description: 'Zoom through transition' },
  { id: 'wipe', label: 'Wipe', icon: '➡️', category: 'smooth', description: 'Horizontal wipe' },
  { id: 'slide', label: 'Slide', icon: '📱', category: 'smooth', description: 'Slide push' },
];

const DURATIONS = [0.3, 0.5, 0.8, 1.0, 1.5];

export default function TransitionLibrary({ open, onClose, sceneA, sceneB, onApply }) {
  const [selectedTransition, setSelectedTransition] = useState(sceneA?.transition_type || 'cut');
  const [duration, setDuration] = useState(sceneA?.transition_duration || 0.5);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleApply = async () => {
    setSaving(true);
    await base44.entities.Scenes.update(sceneA.id, {
      transition_type: selectedTransition,
      transition_duration: duration,
    });
    setSaving(false);
    onApply?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl border border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h3 className="text-white font-semibold">Transition</h3>
            <p className="text-xs text-gray-400">S{sceneA?.scene_number} → S{sceneB?.scene_number}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Transition grid */}
          <div className="grid grid-cols-3 gap-2">
            {TRANSITIONS.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTransition(t.id)}
                className={`p-3 rounded-xl text-center transition-all ${
                  selectedTransition === t.id
                    ? 'bg-blue-600 ring-2 ring-blue-400'
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
              >
                <span className="text-2xl block mb-1">{t.icon}</span>
                <span className="text-xs text-white font-medium">{t.label}</span>
              </button>
            ))}
          </div>

          {/* Duration selector */}
          {selectedTransition !== 'cut' && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Duration</p>
              <div className="flex gap-2">
                {DURATIONS.map(d => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      duration === d ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Preview hint */}
          <div className="bg-gray-800 rounded-xl p-3 flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-10 h-7 rounded bg-gray-700 overflow-hidden">
                {sceneA?.image_url && <img src={sceneA.image_url} className="w-full h-full object-cover" alt="" />}
              </div>
              <span className="text-lg">{TRANSITIONS.find(t => t.id === selectedTransition)?.icon}</span>
              <div className="w-10 h-7 rounded bg-gray-700 overflow-hidden">
                {sceneB?.image_url && <img src={sceneB.image_url} className="w-full h-full object-cover" alt="" />}
              </div>
            </div>
            <p className="text-xs text-gray-400 flex-1">
              {TRANSITIONS.find(t => t.id === selectedTransition)?.description}
              {selectedTransition !== 'cut' && ` · ${duration}s`}
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-gray-700 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-gray-800 text-gray-300 text-sm font-medium hover:bg-gray-700">
            Cancel
          </button>
          <button onClick={handleApply} disabled={saving} className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            {saving ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}