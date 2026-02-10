import React, { useState } from 'react';
import TimelineBlock from './TimelineBlock';

export default function Timeline({ 
  blocks, 
  totalDuration, 
  onBlockDurationChange, 
  onBlockStartTimeChange, 
  onBlockGenerate, 
  onBlockDelete,
  generatingBlockId 
}) {
  const pixelsPerSecond = 100;
  const timelineWidth = (totalDuration || 60) * pixelsPerSecond;

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="mb-4">
        <h3 className="font-semibold mb-2">Timeline (Drag to move, resize right edge)</h3>
        <p className="text-xs text-gray-600">Total duration: {(totalDuration || 0).toFixed(1)}s</p>
      </div>

      {/* Timeline ruler */}
      <div className="bg-gray-100 rounded overflow-x-auto">
        <div className="relative" style={{ width: `${timelineWidth + 100}px`, height: '60px' }}>
          {/* Time markers */}
          <div className="absolute top-0 left-0 right-0 h-8 border-b">
            {Array.from({ length: Math.ceil((totalDuration || 60) / 5) + 1 }).map((_, i) => {
              const time = i * 5;
              return (
                <div
                  key={time}
                  className="absolute text-xs text-gray-600 font-mono"
                  style={{ left: `${time * pixelsPerSecond}px` }}
                >
                  {time}s
                </div>
              );
            })}
          </div>

          {/* Grid lines */}
          <div className="absolute top-8 left-0 right-0 bottom-0">
            {Array.from({ length: Math.ceil((totalDuration || 60) / 5) + 1 }).map((_, i) => {
              const time = i * 5;
              return (
                <div
                  key={`line-${time}`}
                  className="absolute top-0 bottom-0 border-l border-gray-300"
                  style={{ left: `${time * pixelsPerSecond}px` }}
                />
              );
            })}
          </div>

          {/* Blocks */}
          <div className="absolute top-8 left-0 right-0 bottom-0">
            {blocks.map(block => (
              <TimelineBlock
                key={block.id}
                block={block}
                pixelsPerSecond={pixelsPerSecond}
                onDurationChange={onBlockDurationChange}
                onStartTimeChange={onBlockStartTimeChange}
                onGenerate={onBlockGenerate}
                onDelete={onBlockDelete}
                isGenerating={generatingBlockId === block.id}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}