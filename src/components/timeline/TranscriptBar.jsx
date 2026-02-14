import React, { useRef, useEffect } from 'react';
import { FileText, Hash } from 'lucide-react';

export default function TranscriptBar({ currentScene, currentTime, allScenes }) {
  const scrollRef = useRef(null);
  const activeWordRef = useRef(null);

  if (!currentScene) {
    return (
      <div className="bg-gray-800 text-gray-500 px-4 py-3 rounded-b-lg text-sm flex items-center gap-2">
        <FileText className="w-4 h-4" /> No scene at current position
      </div>
    );
  }

  const narration = currentScene.narration_text || '';
  const words = narration.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const timeInScene = currentTime - (currentScene.start_time || 0);
  const sceneDuration = currentScene.duration_seconds || 8;
  const progress = Math.min(1, Math.max(0, timeInScene / sceneDuration));
  const currentWordIndex = Math.floor(progress * wordCount);

  // Auto-scroll to keep the current word visible
  useEffect(() => {
    if (activeWordRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = activeWordRef.current;
      const elLeft = el.offsetLeft;
      const elWidth = el.offsetWidth;
      const cLeft = container.scrollLeft;
      const cWidth = container.clientWidth;
      if (elLeft < cLeft || elLeft + elWidth > cLeft + cWidth) {
        container.scrollLeft = elLeft - cWidth / 2;
      }
    }
  }, [currentWordIndex]);

  return (
    <div className="bg-gray-800 px-4 py-3 rounded-b-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase text-gray-500 font-medium flex items-center gap-1">
            <FileText className="w-3 h-3" /> Scene {currentScene.scene_number} Transcript
          </span>
          <span className="text-[10px] text-gray-500 flex items-center gap-1">
            <Hash className="w-3 h-3" /> {wordCount} words
          </span>
        </div>
        <span className="text-[10px] text-gray-500">
          ~word {Math.min(currentWordIndex + 1, wordCount)}/{wordCount}
        </span>
      </div>
      <div ref={scrollRef} className="overflow-x-auto whitespace-nowrap pb-1 scrollbar-thin">
        <p className="text-sm leading-relaxed inline">
          {words.map((word, i) => {
            const isCurrent = i === currentWordIndex;
            return (
              <span
                key={i}
                ref={isCurrent ? activeWordRef : null}
                className={
                  isCurrent
                    ? 'text-white font-semibold bg-blue-600/40 px-0.5 rounded'
                    : i < currentWordIndex
                    ? 'text-gray-500'
                    : 'text-gray-300'
                }
              >
                {word}{' '}
              </span>
            );
          })}
        </p>
      </div>
    </div>
  );
}