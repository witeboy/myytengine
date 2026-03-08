import React, { useMemo } from 'react';

// ══════════════════════════════════════════════════════════════════
// RealtimeCaptions — Word-by-Word Highlighting Caption Display
// ══════════════════════════════════════════════════════════════════
// Features:
// - Karaoke-style word highlighting
// - Smooth transitions
// - Multiple style presets
// - Progress indicator
// ══════════════════════════════════════════════════════════════════

const CAPTION_STYLES = {
  default: {
    container: 'bg-black/80 backdrop-blur-sm rounded-lg px-6 py-3',
    text: 'text-xl font-bold',
    activeWord: 'text-yellow-300',
    spokenWord: 'text-white',
    unspokenWord: 'text-gray-400'
  },
  minimal: {
    container: 'bg-black/60 rounded px-4 py-2',
    text: 'text-lg font-semibold',
    activeWord: 'text-white underline',
    spokenWord: 'text-white/90',
    unspokenWord: 'text-white/50'
  },
  bold: {
    container: 'bg-gradient-to-r from-purple-900/90 to-pink-900/90 backdrop-blur rounded-xl px-8 py-4 shadow-2xl',
    text: 'text-2xl font-black uppercase tracking-wide',
    activeWord: 'text-yellow-400 scale-110 inline-block',
    spokenWord: 'text-white',
    unspokenWord: 'text-purple-300'
  },
  netflix: {
    container: 'bg-black px-4 py-2',
    text: 'text-lg font-medium',
    activeWord: 'text-white bg-red-600 px-1',
    spokenWord: 'text-white',
    unspokenWord: 'text-white'
  },
  tiktok: {
    container: 'px-4 py-2',
    text: 'text-3xl font-black',
    activeWord: 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]',
    spokenWord: 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]',
    unspokenWord: 'text-gray-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'
  }
};

export default function RealtimeCaptions({
  caption,
  currentTime,
  style = 'default',
  position = 'bottom', // 'bottom' | 'top' | 'center'
  maxWidth = '80%'
}) {
  if (!caption) return null;

  const styles = CAPTION_STYLES[style] || CAPTION_STYLES.default;

  // Calculate which word is active
  const { words, text, startTime, duration } = caption;
  
  const wordData = useMemo(() => {
    if (!words || words.length === 0) {
      // Fallback: split text and calculate timing
      const splitWords = text.split(/\s+/);
      const wordDuration = duration / splitWords.length;
      return splitWords.map((word, idx) => ({
        word,
        startTime: startTime + (idx * wordDuration),
        endTime: startTime + ((idx + 1) * wordDuration)
      }));
    }
    return words;
  }, [words, text, startTime, duration]);

  // Find active word index
  const activeIndex = wordData.findIndex(
    w => currentTime >= w.startTime && currentTime < w.endTime
  );

  // Calculate progress through caption
  const progress = Math.min(100, Math.max(0, 
    ((currentTime - startTime) / duration) * 100
  ));

  // Position classes
  const positionClasses = {
    bottom: 'absolute bottom-16 left-1/2 -translate-x-1/2',
    top: 'absolute top-16 left-1/2 -translate-x-1/2',
    center: 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
  };

  return (
    <div 
      className={`${positionClasses[position]} z-50`}
      style={{ maxWidth }}
    >
      <div className={styles.container}>
        {/* Progress bar (optional, subtle) */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-white/40 transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Caption text with word highlighting */}
        <p className={`${styles.text} text-center leading-relaxed`}>
          {wordData.map((wordObj, idx) => {
            let wordClass = styles.unspokenWord;
            
            if (idx < activeIndex) {
              wordClass = styles.spokenWord;
            } else if (idx === activeIndex) {
              wordClass = styles.activeWord;
            }

            return (
              <span
                key={idx}
                className={`transition-all duration-75 ${wordClass}`}
              >
                {wordObj.word}{' '}
              </span>
            );
          })}
        </p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// CaptionTrack — Caption visualization for timeline
// ══════════════════════════════════════════════════════════════════

export function CaptionTrack({
  captions = [],
  pixelsPerSecond,
  currentTime,
  onCaptionClick
}) {
  return (
    <div className="relative h-12 bg-[#1a1a2e]">
      {captions.map((caption, idx) => {
        const left = caption.startTime * pixelsPerSecond;
        const width = caption.duration * pixelsPerSecond;
        const isActive = currentTime >= caption.startTime && currentTime < caption.endTime;

        return (
          <div
            key={caption.id || idx}
            className={`absolute top-1 bottom-1 rounded cursor-pointer transition-all ${
              isActive 
                ? 'bg-yellow-500/80 ring-2 ring-yellow-400' 
                : 'bg-orange-600/60 hover:bg-orange-500/70'
            }`}
            style={{ left, width: Math.max(20, width) }}
            onClick={() => onCaptionClick?.(caption)}
            title={caption.text}
          >
            <div className="px-2 py-1 h-full overflow-hidden">
              <p className="text-[10px] text-white truncate leading-tight">
                {caption.text}
              </p>
            </div>
          </div>
        );
      })}
      
      {/* Playhead */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-10"
        style={{ left: currentTime * pixelsPerSecond }}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// CaptionEditor — Edit caption text and timing
// ══════════════════════════════════════════════════════════════════

export function CaptionEditor({
  caption,
  onUpdate,
  onClose
}) {
  if (!caption) return null;

  const [text, setText] = React.useState(caption.text);
  const [startTime, setStartTime] = React.useState(caption.startTime);
  const [duration, setDuration] = React.useState(caption.duration);

  const handleSave = () => {
    onUpdate?.({
      ...caption,
      text,
      startTime,
      duration,
      endTime: startTime + duration
    });
    onClose?.();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-white mb-4">Edit Caption</h3>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 block mb-1">Text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm"
              rows={3}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 block mb-1">Start (s)</label>
              <input
                type="number"
                step="0.1"
                value={startTime}
                onChange={(e) => setStartTime(parseFloat(e.target.value))}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Duration (s)</label>
              <input
                type="number"
                step="0.1"
                value={duration}
                onChange={(e) => setDuration(parseFloat(e.target.value))}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
