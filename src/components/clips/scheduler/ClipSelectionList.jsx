import React from 'react';
import { Flame, CheckSquare, Square } from 'lucide-react';

export default function ClipSelectionList({ clips, selectedIndices, onToggle, onToggleAll }) {
  const allSelected = selectedIndices.length === clips.length && clips.length > 0;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
          Select clips ({selectedIndices.length}/{clips.length})
        </span>
        <button
          onClick={onToggleAll}
          className="text-[10px] text-gray-600 hover:text-gray-900 flex items-center gap-1 font-medium"
        >
          {allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <div className="max-h-60 overflow-y-auto divide-y divide-gray-100">
        {clips.map((clip, i) => {
          const selected = selectedIndices.includes(i);
          const score = clip.virality_score || 0;
          return (
            <button
              key={i}
              onClick={() => onToggle(i)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors ${
                selected ? 'bg-blue-50' : ''
              }`}
            >
              {selected ? (
                <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />
              )}
              <span className="text-xs font-medium text-gray-900 flex-1 truncate">
                {clip.title || `Clip ${i + 1}`}
              </span>
              {score > 0 && (
                <span className="flex items-center gap-0.5 flex-shrink-0">
                  <Flame className={`w-3 h-3 ${score >= 85 ? 'text-red-500' : 'text-amber-500'}`} />
                  <span className="text-[10px] font-bold text-gray-600">{score}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}