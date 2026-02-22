import React, { useRef, useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { FileText, Hash, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TranscriptBar({ currentScene, currentTime, projectId }) {
  const scrollRef = useRef(null);
  const activeWordRef = useRef(null);
  const [generating, setGenerating] = useState(false);

  // Fetch word-level transcript from Transcripts entity
  const { data: transcripts = [], refetch } = useQuery({
    queryKey: ['transcript', projectId],
    queryFn: () => base44.entities.Transcripts.filter({ project_id: projectId }),
    enabled: !!projectId,
    refetchInterval: (query) => {
      const t = query.state.data?.[0];
      return t?.status === 'processing' ? 3000 : false;
    },
  });

  const transcript = transcripts[0];
  const wordTimings = useMemo(() => {
    if (!transcript?.word_timings) return null;
    try { return JSON.parse(transcript.word_timings); } catch { return null; }
  }, [transcript?.word_timings]);

  const hasAccurateSync = transcript?.status === 'ready' && wordTimings?.length > 0;

  // Find current word index from word-level timings
  const currentWordIndex = useMemo(() => {
    if (!hasAccurateSync) {
      // Fallback: estimate from scene progress (old behavior)
      if (!currentScene) return 0;
      const narration = currentScene.narration_text || '';
      const words = narration.split(/\s+/).filter(Boolean);
      const timeInScene = currentTime - (currentScene.start_time || 0);
      const sceneDuration = currentScene.duration_seconds || 8;
      const progress = Math.min(1, Math.max(0, timeInScene / sceneDuration));
      return Math.floor(progress * words.length);
    }
    // Use accurate word-level timings
    for (let i = wordTimings.length - 1; i >= 0; i--) {
      if (currentTime >= wordTimings[i].start) return i;
    }
    return 0;
  }, [hasAccurateSync, wordTimings, currentTime, currentScene]);

  // Words to display
  const displayWords = useMemo(() => {
    if (hasAccurateSync) {
      return wordTimings.map(w => w.word);
    }
    if (!currentScene) return [];
    return (currentScene.narration_text || '').split(/\s+/).filter(Boolean);
  }, [hasAccurateSync, wordTimings, currentScene]);

  const totalWords = displayWords.length;

  // Group words into lines of ~10 words each, show 5 lines around current word
  const WORDS_PER_LINE = 10;
  const VISIBLE_LINES = 5;

  const currentLineIndex = Math.floor(currentWordIndex / WORDS_PER_LINE);
  const startLine = Math.max(0, currentLineIndex - Math.floor(VISIBLE_LINES / 2));
  const endLine = startLine + VISIBLE_LINES;
  const startWordIdx = startLine * WORDS_PER_LINE;
  const endWordIdx = Math.min(totalWords, endLine * WORDS_PER_LINE);

  // Auto-scroll to active word
  useEffect(() => {
    if (activeWordRef.current && scrollRef.current) {
      const el = activeWordRef.current;
      const container = scrollRef.current;
      const elTop = el.offsetTop;
      const elHeight = el.offsetHeight;
      const cTop = container.scrollTop;
      const cHeight = container.clientHeight;
      if (elTop < cTop || elTop + elHeight > cTop + cHeight) {
        container.scrollTop = elTop - cHeight / 3;
      }
    }
  }, [currentWordIndex]);

  const handleGenerateTranscript = async () => {
    setGenerating(true);
    try {
      await base44.functions.invoke('generateTranscript', { project_id: projectId });
      refetch();
    } finally {
      setGenerating(false);
    }
  };

  if (!currentScene && !hasAccurateSync) {
    return (
      <div className="bg-gray-800 text-gray-500 px-4 py-3 rounded-b-lg text-sm flex items-center gap-2">
        <FileText className="w-4 h-4" /> No scene at current position
      </div>
    );
  }

  const isProcessing = transcript?.status === 'processing';

  return (
    <div className="bg-gray-800 px-4 py-3 rounded-b-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase text-gray-500 font-medium flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {hasAccurateSync ? 'Synced Transcript' : currentScene ? `Scene ${currentScene.scene_number} Transcript` : 'Transcript'}
          </span>
          <span className="text-[10px] text-gray-500 flex items-center gap-1">
            <Hash className="w-3 h-3" /> {totalWords} words
          </span>
          {hasAccurateSync && (
            <span className="text-[9px] bg-green-900/50 text-green-400 px-1.5 py-0.5 rounded">
              Word-level sync
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">
            ~word {Math.min(currentWordIndex + 1, totalWords)}/{totalWords}
          </span>
          {!hasAccurateSync && !isProcessing && projectId && (
            <Button
              size="sm"
              variant="ghost"
              className="h-5 px-2 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-900/30"
              onClick={handleGenerateTranscript}
              disabled={generating}
            >
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              <span className="ml-1">Sync</span>
            </Button>
          )}
          {isProcessing && (
            <span className="text-[10px] text-amber-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Syncing...
            </span>
          )}
        </div>
      </div>
      <div
        ref={scrollRef}
        className="overflow-y-auto pb-1 scrollbar-thin"
        style={{ maxHeight: '7.5rem' }}
      >
        <p className="text-sm leading-relaxed">
          {displayWords.slice(startWordIdx, endWordIdx).map((word, i) => {
            const globalIdx = startWordIdx + i;
            const isCurrent = globalIdx === currentWordIndex;
            return (
              <span
                key={globalIdx}
                ref={isCurrent ? activeWordRef : null}
                className={
                  isCurrent
                    ? 'text-white font-semibold bg-blue-600/40 px-0.5 rounded'
                    : globalIdx < currentWordIndex
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