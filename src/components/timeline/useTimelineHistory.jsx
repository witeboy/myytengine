import { useState, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';

// Undo/Redo history for timeline scene changes
export default function useTimelineHistory(refetchScenes) {
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [applying, setApplying] = useState(false);
  const deletingRef = useRef(new Set());

  // Save a snapshot before making a change
  const pushUndo = useCallback((action) => {
    // action = { type: 'update'|'delete_media'|'delete_scene', sceneId, before: {...}, after?: {...} }
    setUndoStack(prev => [...prev.slice(-30), action]); // Keep last 30 actions
    setRedoStack([]); // Clear redo on new action
  }, []);

  const undo = useCallback(async () => {
    if (undoStack.length === 0 || applying) return;
    setApplying(true);
    const action = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));

    if (action.type === 'update' || action.type === 'delete_media') {
      await base44.entities.Scenes.update(action.sceneId, action.before);
    }

    setRedoStack(prev => [...prev, action]);
    await refetchScenes();
    setApplying(false);
  }, [undoStack, applying, refetchScenes]);

  const redo = useCallback(async () => {
    if (redoStack.length === 0 || applying) return;
    setApplying(true);
    const action = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));

    if (action.type === 'update' && action.after) {
      await base44.entities.Scenes.update(action.sceneId, action.after);
    } else if (action.type === 'delete_media') {
      await base44.entities.Scenes.update(action.sceneId, action.after);
    }

    setUndoStack(prev => [...prev, action]);
    await refetchScenes();
    setApplying(false);
  }, [redoStack, applying, refetchScenes]);

  // Helper: delete media from a scene (image, video, or both)
  // Clears the media and redistributes the deleted scene's duration to neighbors
  const deleteSceneMedia = useCallback(async (scene, mediaType) => {
    // mediaType: 'image' | 'video' | 'both'
    const before = {};
    const after = {};

    if (mediaType === 'image' || mediaType === 'both') {
      before.image_url = scene.image_url;
      after.image_url = '';
      if (scene.status === 'image_generated') {
        before.status = scene.status;
        after.status = 'prompts_ready';
      }
    }
    if (mediaType === 'video' || mediaType === 'both') {
      before.video_url = scene.video_url;
      after.video_url = '';
      if (scene.status === 'video_generated' || scene.status === 'video_ready') {
        before.status = scene.status;
        after.status = scene.image_url && mediaType !== 'both' ? 'image_generated' : 'prompts_ready';
      }
    }

    pushUndo({ type: 'delete_media', sceneId: scene.id, before, after });
    await base44.entities.Scenes.update(scene.id, after);
    await refetchScenes();
  }, [pushUndo, refetchScenes]);

  // Helper: delete a scene entirely and close the gap by renumbering remaining scenes
  const deleteScene = useCallback(async (scene, allScenes) => {
    // Prevent double-delete of the same scene
    if (deletingRef.current.has(scene.id)) return;
    deletingRef.current.add(scene.id);

    pushUndo({
      type: 'delete_scene',
      sceneId: scene.id,
      before: { ...scene },
    });

    // Delete the scene (ignore if already deleted)
    try {
      await base44.entities.Scenes.delete(scene.id);
    } catch (e) {
      deletingRef.current.delete(scene.id);
      if (e.message?.includes('not found')) {
        await refetchScenes();
        return;
      }
      throw e;
    }

    // Renumber remaining scenes to close the gap — sequentially to avoid rate limits
    const remaining = allScenes
      .filter(s => s.id !== scene.id)
      .sort((a, b) => a.scene_number - b.scene_number);

    for (let i = 0; i < remaining.length; i++) {
      const correctNumber = i + 1;
      if (remaining[i].scene_number !== correctNumber) {
        await base44.entities.Scenes.update(remaining[i].id, { scene_number: correctNumber });
      }
    }

    await refetchScenes();
  }, [pushUndo, refetchScenes]);

  return {
    pushUndo,
    undo,
    redo,
    deleteSceneMedia,
    deleteScene,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    applying,
  };
}