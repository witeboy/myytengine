import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import DraggableSceneCard from './DraggableSceneCard';
import ActGroupHeader from './ActGroupHeader';
import { Button } from '@/components/ui/button';
import { LayoutGrid, List } from 'lucide-react';

export default function SceneGrid({ scenes, onRefetch, orientation }) {
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'acts'
  const [collapsedActs, setCollapsedActs] = useState({});

  const existingActs = useMemo(() => {
    const acts = scenes.map(s => s.act).filter(Boolean);
    return [...new Set(acts)];
  }, [scenes]);

  const groupedByAct = useMemo(() => {
    const groups = {};
    const ungrouped = [];
    scenes.forEach(s => {
      if (s.act) {
        if (!groups[s.act]) groups[s.act] = [];
        groups[s.act].push(s);
      } else {
        ungrouped.push(s);
      }
    });
    return { groups, ungrouped };
  }, [scenes]);

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const srcIdx = result.source.index;
    const destIdx = result.destination.index;
    if (srcIdx === destIdx) return;

    // Reorder locally
    const reordered = [...scenes];
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(destIdx, 0, moved);

    // Update scene_number for all affected scenes
    const updates = reordered.map((scene, i) => ({
      id: scene.id,
      newNumber: i + 1,
      oldNumber: scene.scene_number,
    })).filter(u => u.newNumber !== u.oldNumber);

    await Promise.all(
      updates.map(u => base44.entities.Scenes.update(u.id, { scene_number: u.newNumber }))
    );

    onRefetch();
  };

  const toggleAct = (actName) => {
    setCollapsedActs(prev => ({ ...prev, [actName]: !prev[actName] }));
  };

  const isPortrait = orientation === 'portrait';
  const gridCols = isPortrait
    ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

  const sceneCallbacks = (scene) => ({
    onRegenerateImage: async () => {
      try {
        await base44.functions.invoke('generateSceneImage', { scene_id: scene.id });
        onRefetch();

        // Poll until resolved (max 2 min)
        for (let i = 0; i < 24; i++) {
          await new Promise(r => setTimeout(r, 5000));
          try {
            const pollRes = await base44.functions.invoke('pollSceneImage', { scene_id: scene.id });
            const pollData = pollRes.data || pollRes;
            const result = pollData.results?.[0];
            if (result?.status === 'done' || result?.status === 'failed') {
              break;
            }
          } catch (_) {}
          onRefetch();
        }
      } catch (err) {
        console.warn(`Scene ${scene.scene_number} image failed:`, err?.response?.data?.error || err.message);
      }
      onRefetch();
    },
    onAnimateScene: async () => {
      try {
        const res = await base44.functions.invoke('generateSceneVideo', { scene_id: scene.id });
        if (res.data?.error) {
          console.warn(`Scene ${scene.scene_number} animate error:`, res.data.error);
        }
      } catch (err) {
        console.warn(`Scene ${scene.scene_number} animate failed:`, err?.response?.data?.error || err.message);
      }
      onRefetch();
    },
    onSceneUpdated: () => onRefetch(),
  });

  return (
    <div>
      {/* View toggle */}
      <div className="flex items-center gap-2 mb-4">
        <Button
          size="sm"
          variant={viewMode === 'grid' ? 'default' : 'outline'}
          onClick={() => setViewMode('grid')}
          className="h-8"
        >
          <LayoutGrid className="w-3.5 h-3.5 mr-1" /> All Scenes
        </Button>
        <Button
          size="sm"
          variant={viewMode === 'acts' ? 'default' : 'outline'}
          onClick={() => setViewMode('acts')}
          className="h-8"
        >
          <List className="w-3.5 h-3.5 mr-1" /> Group by Act
        </Button>
      </div>

      {viewMode === 'grid' ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="scenes" direction="horizontal">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`grid ${gridCols} gap-4`}
              >
                {scenes.map((scene, index) => (
                 <DraggableSceneCard
                    key={scene.id}
                    scene={scene}
                    index={index}
                    existingActs={existingActs}
                    orientation={orientation}
                    {...sceneCallbacks(scene)}
                  />
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : (
        <div className="space-y-4">
          {/* Grouped acts */}
          {Object.entries(groupedByAct.groups).map(([actName, actScenes]) => (
            <div key={actName}>
              <ActGroupHeader
                actName={actName}
                sceneCount={actScenes.length}
                collapsed={!!collapsedActs[actName]}
                onToggle={() => toggleAct(actName)}
              />
              {!collapsedActs[actName] && (
                <div className={`grid ${gridCols} gap-4 mt-3 ml-4 pl-3 border-l-2 border-blue-200`}>
                  {actScenes.map((scene) => (
                    <div key={scene.id}>
                      <DraggableSceneCard
                        scene={scene}
                        index={scenes.indexOf(scene)}
                        existingActs={existingActs}
                        orientation={orientation}
                        {...sceneCallbacks(scene)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Ungrouped */}
          {groupedByAct.ungrouped.length > 0 && (
            <div>
              <ActGroupHeader
                actName="Ungrouped"
                sceneCount={groupedByAct.ungrouped.length}
                collapsed={!!collapsedActs['__ungrouped']}
                onToggle={() => toggleAct('__ungrouped')}
              />
              {!collapsedActs['__ungrouped'] && (
                <div className={`grid ${gridCols} gap-4 mt-3 ml-4 pl-3 border-l-2 border-gray-200`}>
                  {groupedByAct.ungrouped.map((scene) => (
                    <div key={scene.id}>
                      <DraggableSceneCard
                        scene={scene}
                        index={scenes.indexOf(scene)}
                        existingActs={existingActs}
                        orientation={orientation}
                        {...sceneCallbacks(scene)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}