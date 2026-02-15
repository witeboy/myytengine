import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, ArrowRight } from 'lucide-react';

function parseSafe(str) {
  try { return JSON.parse(str || '{}'); } catch { return {}; }
}

function Diff({ label, oldVal, newVal }) {
  if (oldVal === newVal) return null;
  return (
    <div className="flex items-center gap-2 text-xs py-1">
      <span className="text-gray-500 w-24 flex-shrink-0">{label}</span>
      <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded line-through">{oldVal || '—'}</span>
      <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
      <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded">{newVal || '—'}</span>
    </div>
  );
}

export default function VersionCompareModal({ older, newer, onClose }) {
  const oldProject = parseSafe(older.snapshot_data);
  const newProject = parseSafe(newer.snapshot_data);
  const oldScenes = JSON.parse(older.scenes_snapshot || '[]');
  const newScenes = JSON.parse(newer.scenes_snapshot || '[]');

  const projectFields = ['status', 'niche', 'tone', 'orientation', 'visual_style', 'video_duration_minutes'];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            Compare: v{older.version_number}
            <ArrowRight className="w-4 h-4 text-gray-400" />
            v{newer.version_number}
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="overflow-y-auto max-h-[70vh] p-4 space-y-4">
          {/* Project changes */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Project Settings</h4>
            <div className="bg-gray-50 rounded-lg p-3">
              {projectFields.map(field => (
                <Diff
                  key={field}
                  label={field.replace(/_/g, ' ')}
                  oldVal={String(oldProject[field] ?? '')}
                  newVal={String(newProject[field] ?? '')}
                />
              ))}
              {projectFields.every(f => String(oldProject[f] ?? '') === String(newProject[f] ?? '')) && (
                <p className="text-xs text-gray-400">No project setting changes</p>
              )}
            </div>
          </div>

          {/* Scenes changes */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">
              Scenes: {oldScenes.length} → {newScenes.length}
            </h4>
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              {oldScenes.length !== newScenes.length && (
                <div className="flex items-center gap-2 text-xs">
                  <Badge className={newScenes.length > oldScenes.length ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                    {newScenes.length > oldScenes.length ? '+' : ''}{newScenes.length - oldScenes.length} scenes
                  </Badge>
                </div>
              )}
              <div className="text-xs text-gray-600 space-y-1">
                <p>Old: {oldScenes.filter(s => s.image_url).length} images, {oldScenes.filter(s => s.video_url).length} videos</p>
                <p>New: {newScenes.filter(s => s.image_url).length} images, {newScenes.filter(s => s.video_url).length} videos</p>
              </div>
              {newScenes.slice(0, 5).map((scene, i) => {
                const oldScene = oldScenes.find(s => s.scene_number === scene.scene_number);
                const changed = oldScene && (
                  oldScene.narration_text !== scene.narration_text ||
                  oldScene.image_url !== scene.image_url ||
                  oldScene.video_url !== scene.video_url ||
                  oldScene.duration_seconds !== scene.duration_seconds
                );
                if (!changed && oldScene) return null;
                return (
                  <div key={i} className="bg-white rounded p-2 border text-xs">
                    <span className="font-medium">Scene {scene.scene_number}</span>
                    {!oldScene ? (
                      <Badge className="ml-2 bg-green-100 text-green-700 text-[9px]">New</Badge>
                    ) : (
                      <Badge className="ml-2 bg-yellow-100 text-yellow-700 text-[9px]">Changed</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}