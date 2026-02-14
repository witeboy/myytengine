import React from 'react';
import { FileText, Hash } from 'lucide-react';

export default function TranscriptBar({ currentScene, currentTime }) {
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

  // Estimate which word we're at based on time within this scene
  const timeInScene = currentTime - (currentScene.start_time || 0);
  const sceneDuration = currentScene.duration_seconds || 8;
  const progress = Math.min(1, Math.max(0, timeInScene / sceneDuration));
  const currentWordIndex = Math.floor(progress * wordCount);

  // Show a window of words around the current word
  const windowSize = 12;
  const start = Math.max(0, currentWordIndex - Math.floor(windowSize / 2));
  const end = Math.min(words.length, start + windowSize);

  return (
    <div className="bg-gray-800 px-4 py-3 rounded-b-lg">
      <div className="flex items-center justify-between mb-1">
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
      <p className="text-sm text-gray-300 leading-relaxed">
        {start > 0 && <span className="text-gray-600">... </span>}
        {words.slice(start, end).map((word, i) => {
          const absIdx = start + i;
          const isCurrent = absIdx === currentWordIndex;
          return (
            <span
              key={absIdx}
              className={
                isCurrent
                  ? 'text-white font-semibold bg-blue-600/30 px-0.5 rounded'
                  : absIdx < currentWordIndex
                  ? 'text-gray-400'
                  : 'text-gray-300'
              }
            >
              {word}{' '}
            </span>
          );
        })}
        {end < words.length && <span className="text-gray-600">...</span>}
      </p>
    </div>
  );
}