import React, { useRef, useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, Video } from 'lucide-react';

export default function StoryboardTimeline({
  blocks = [],
  totalDuration = 60,
  onBlockDurationChange,
  onBlockStartTimeChange,
  onBlockGenerate,
  onBlockDelete,
  generatingBlockId,
  voiceoverUrl
}) {
  const timelineRef = useRef(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(10);
  const [draggedBlock, setDraggedBlock] = useState(null);
  const [isResizing, setIsResizing] = useState(null);

  useEffect(() => {
    if (timelineRef.current) {
      const width = timelineRef.current.offsetWidth - 20;
      setPixelsPerSecond(width / totalDuration);
    }
  }, [totalDuration]);

  const handleMouseDown = (blockId, isResize = false) => {
    if (isResize) {
      setIsResizing(blockId);
    } else {
      setDraggedBlock(blockId);
    }
  };

  const handleMouseMove = (e) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const deltaX = e.clientX - (rect.left || 0);
    const deltaSeconds = Math.max(0, deltaX / pixelsPerSecond);

    if (draggedBlock) {
      const block = blocks.find(b => b.id === draggedBlock);
      if (block) {
        onBlockStartTimeChange?.(draggedBlock, deltaSeconds);
      }
    } else if (isResizing) {
      const block = blocks.find(b => b.id === isResizing);
      if (block) {
        const newDuration = Math.max(0.5, deltaSeconds - block.start_time_seconds);
        onBlockDurationChange?.(isResizing, newDuration);
      }
    }
  };

  const handleMouseUp = () => {
    setDraggedBlock(null);
    setIsResizing(null);
  };

  useEffect(() => {
    if (draggedBlock || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggedBlock, isResizing, blocks, pixelsPerSecond]);

  return (
    <Card className="bg-white p-6">
      {/* Voiceover Player */}
      {voiceoverUrl && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm font-medium mb-2 text-blue-900">Voiceover Audio</p>
          <audio controls className="w-full">
            <source src={voiceoverUrl} type="audio/mpeg" />
          </audio>
        </div>
      )}

      {/* Timeline */}
      <div className="overflow-x-auto">
        <div ref={timelineRef} className="relative bg-gray-50 border border-gray-200 rounded-lg min-h-96 p-2">
          {/* Time ruler */}
          <div className="flex items-end gap-1 mb-4 text-xs text-gray-500 font-mono">
            {Array.from({ length: Math.ceil(totalDuration / 10) + 1 }).map((_, i) => (
              <div
                key={i}
                style={{ width: pixelsPerSecond * 10 }}
                className="flex-shrink-0 border-l border-gray-300 pl-1"
              >
                {i * 10}s
              </div>
            ))}
          </div>

          {/* Asset Blocks */}
          <div className="relative" style={{ height: blocks.length * 80 + 40 }}>
            {blocks.map((block, idx) => {
              const isGenerating = generatingBlockId === block.id;
              const blockWidth = Math.max(50, block.duration_seconds * pixelsPerSecond);
              const blockLeft = block.start_time_seconds * pixelsPerSecond;
              const bgColor = block.block_type === 'video' ? 'bg-red-100' : 'bg-yellow-100';
              const borderColor = block.block_type === 'video' ? 'border-red-300' : 'border-yellow-300';

              return (
                <div
                  key={block.id}
                  className="absolute top-0"
                  style={{
                    left: blockLeft,
                    top: idx * 80,
                    width: blockWidth,
                    cursor: draggedBlock === block.id ? 'grabbing' : 'grab'
                  }}
                  onMouseDown={() => handleMouseDown(block.id)}
                >
                  <div
                    className={`${bgColor} ${borderColor} border-2 rounded-lg p-3 h-full flex flex-col justify-between relative group hover:shadow-lg transition-shadow`}
                  >
                    {/* Block Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {block.block_type === 'video' ? (
                          <Video className="w-4 h-4 text-red-600" />
                        ) : (
                          <Image className="w-4 h-4 text-yellow-600" />
                        )}
                        <span className="text-xs font-bold text-gray-700 capitalize">
                          {block.block_type}
                        </span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-5 h-5 opacity-0 group-hover:opacity-100"
                        onClick={() => onBlockDelete?.(block.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>

                    {/* Prompt Text */}
                    <p className="text-xs text-gray-700 line-clamp-2 flex-1">
                      {block.prompt}
                    </p>

                    {/* Status & Time */}
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <span>
                        {block.start_time_seconds.toFixed(1)}s - {(block.start_time_seconds + block.duration_seconds).toFixed(1)}s
                      </span>
                    </div>

                    {/* Generate Button or Loading */}
                    {block.status === 'pending' && (
                      <Button
                        onClick={() => onBlockGenerate?.(block.id)}
                        disabled={isGenerating}
                        size="sm"
                        className="w-full mt-2 h-7 text-xs"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          'Generate'
                        )}
                      </Button>
                    )}

                    {block.status === 'completed' && block.generated_asset_url && (
                      <div className="mt-2 text-xs bg-green-50 text-green-700 p-1 rounded text-center">
                        ✓ Asset Ready
                      </div>
                    )}

                    {block.status === 'failed' && (
                      <div className="mt-2 text-xs bg-red-50 text-red-700 p-1 rounded text-center">
                        ✗ Generation Failed
                      </div>
                    )}

                    {block.status === 'generating' && (
                      <div className="mt-2 flex items-center justify-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="text-xs text-gray-700">Generating...</span>
                      </div>
                    )}

                    {/* Resize Handle */}
                    <div
                      onMouseDown={() => handleMouseDown(block.id, true)}
                      className="absolute right-0 top-0 bottom-0 w-2 bg-gray-300 hover:bg-gray-500 cursor-col-resize rounded-r-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex gap-6 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-100 border-2 border-red-300 rounded" />
          <span>Video Block</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-100 border-2 border-yellow-300 rounded" />
          <span>Image Block</span>
        </div>
      </div>
    </Card>
  );
}