import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import SceneCard from './SceneCard';
import SceneNotesEditor from './SceneNotesEditor';
import ActAssigner from './ActAssigner';
import { GripVertical } from 'lucide-react';

export default function DraggableSceneCard({ scene, index, existingActs, onRegenerateImage, onAnimateScene, onSceneUpdated }) {
  return (
    <Draggable draggableId={scene.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`relative ${snapshot.isDragging ? 'z-50 shadow-2xl rotate-1' : ''}`}
        >
          {/* Drag handle */}
          <div
            {...provided.dragHandleProps}
            className="absolute top-2 right-2 z-10 bg-white/90 rounded p-1 cursor-grab active:cursor-grabbing shadow-sm hover:bg-gray-100 transition-colors"
          >
            <GripVertical className="w-4 h-4 text-gray-400" />
          </div>

          <SceneCard
            scene={scene}
            onRegenerateImage={onRegenerateImage}
            onAnimateScene={onAnimateScene}
            onSceneUpdated={onSceneUpdated}
          />

          {/* Act + Notes below card */}
          <div className="mt-1.5 px-1 space-y-1">
            <ActAssigner scene={scene} existingActs={existingActs} onSaved={onSceneUpdated} />
            <SceneNotesEditor scene={scene} onSaved={onSceneUpdated} />
          </div>
        </div>
      )}
    </Draggable>
  );
}