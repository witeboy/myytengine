import React, { useState, useRef } from 'react';
import { Loader2, X, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TimelineBlock({ 
  block, 
  onDurationChange, 
  onStartTimeChange, 
  onGenerate, 
  onDelete, 
  isGenerating,
  pixelsPerSecond 
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const blockRef = useRef(null);
  const startXRef = useRef(0);
  const startTimeRef = useRef(0);

  const handleMouseDown = (e) => {
    if (e.target.closest('button')) return;
    setIsDragging(true);
    startXRef.current = e.clientX;
    startTimeRef.current = block.start_time_seconds;
  };

  const handleResizeMouseDown = (e) => {
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
  };

  React.useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e) => {
      const delta = e.clientX - startXRef.current;
      const timeDelta = delta / pixelsPerSecond;

      if (isDragging) {
        const newTime = Math.max(0, startTimeRef.current + timeDelta);
        onStartTimeChange(block.id, newTime);
      } else if (isResizing) {
        const newDuration = Math.max(1, block.duration_seconds + timeDelta);
        onDurationChange(block.id, newDuration);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, block, pixelsPerSecond, onStartTimeChange, onDurationChange]);

  const blockColor = block.block_type === 'video' ? 'bg-red-200' : 'bg-yellow-200';
  const left = block.start_time_seconds * pixelsPerSecond;
  const width = block.duration_seconds * pixelsPerSecond;

  return (
    <div
      ref={blockRef}
      className={`absolute ${blockColor} border-2 border-gray-400 rounded p-2 cursor-move select-none hover:shadow-lg transition-shadow`}
      style={{
        left: `${left}px`,
        width: `${width}px`,
        minWidth: '60px',
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="text-xs font-semibold mb-1">
        {block.block_type === 'video' ? '🎬 Video' : '🖼️ Image'}
      </div>

      <div className="text-xs line-clamp-2 mb-2 text-gray-700">
        {block.prompt}
      </div>

      {block.status === 'completed' && block.generated_asset_url ? (
        <div className="mb-2">
          {block.block_type === 'video' ? (
            <video src={block.generated_asset_url} className="w-full h-12 rounded object-cover" />
          ) : (
            <img src={block.generated_asset_url} alt="asset" className="w-full h-12 rounded object-cover" />
          )}
        </div>
      ) : null}

      <div className="flex gap-1 mb-1">
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs"
          onClick={() => onGenerate(block.id)}
          disabled={isGenerating || block.status === 'completed'}
        >
          {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : block.status === 'completed' ? '✓' : 'Generate'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs"
          onClick={() => onDelete(block.id)}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>

      <div className="text-xs text-gray-600">
        {block.start_time_seconds.toFixed(1)}s - {(block.start_time_seconds + block.duration_seconds).toFixed(1)}s
      </div>

      <div
        className="absolute right-0 top-0 bottom-0 w-1 bg-gray-600 cursor-col-resize hover:bg-gray-800"
        onMouseDown={handleResizeMouseDown}
      />
    </div>
  );
}