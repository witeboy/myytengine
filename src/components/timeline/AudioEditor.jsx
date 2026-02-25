import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Scissors, Trash2, Merge, ScanSearch, Play, Pause, Square,
  Loader2, Download, Undo2, ChevronDown, ChevronUp, X, Check
} from 'lucide-react';

// Decode audio file into AudioBuffer
async function decodeAudio(url) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  ctx.close();
  return audioBuffer;
}

// Extract waveform peaks for visualization
function getWaveformPeaks(audioBuffer, numPeaks = 800) {
  const channelData = audioBuffer.getChannelData(0);
  const blockSize = Math.floor(channelData.length / numPeaks);
  const peaks = [];
  for (let i = 0; i < numPeaks; i++) {
    let max = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j++) {
      const abs = Math.abs(channelData[start + j] || 0);
      if (abs > max) max = abs;
    }
    peaks.push(max);
  }
  return peaks;
}

// Detect silent regions
function detectSilentRegions(audioBuffer, thresholdDb = -40, minDurationSec = 0.3) {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const threshold = Math.pow(10, thresholdDb / 20);
  const minSamples = Math.floor(minDurationSec * sampleRate);
  const blockSize = Math.floor(sampleRate * 0.01); // 10ms blocks

  const regions = [];
  let silenceStart = null;

  for (let i = 0; i < channelData.length; i += blockSize) {
    let rms = 0;
    const end = Math.min(i + blockSize, channelData.length);
    for (let j = i; j < end; j++) {
      rms += channelData[j] * channelData[j];
    }
    rms = Math.sqrt(rms / (end - i));

    if (rms < threshold) {
      if (silenceStart === null) silenceStart = i;
    } else {
      if (silenceStart !== null) {
        const duration = i - silenceStart;
        if (duration >= minSamples) {
          regions.push({
            start: silenceStart / sampleRate,
            end: i / sampleRate,
            duration: duration / sampleRate,
          });
        }
        silenceStart = null;
      }
    }
  }
  // Handle trailing silence
  if (silenceStart !== null) {
    const duration = channelData.length - silenceStart;
    if (duration >= minSamples) {
      regions.push({
        start: silenceStart / sampleRate,
        end: channelData.length / sampleRate,
        duration: duration / sampleRate,
      });
    }
  }
  return regions;
}

// Render AudioBuffer to WAV blob
function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const samples = buffer.length;
  const dataSize = samples * blockAlign;
  const bufferSize = 44 + dataSize;
  const wav = new ArrayBuffer(bufferSize);
  const view = new DataView(wav);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  return new Blob([wav], { type: 'audio/wav' });
}

// Splice audio buffer - remove a region
function spliceAudioBuffer(buffer, startSec, endSec) {
  const ctx = new OfflineAudioContext(
    buffer.numberOfChannels,
    Math.max(1, buffer.length - Math.floor((endSec - startSec) * buffer.sampleRate)),
    buffer.sampleRate
  );
  const startSample = Math.floor(startSec * buffer.sampleRate);
  const endSample = Math.floor(endSec * buffer.sampleRate);
  const newLength = buffer.length - (endSample - startSample);

  const newBuffer = ctx.createBuffer(buffer.numberOfChannels, Math.max(1, newLength), buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const oldData = buffer.getChannelData(ch);
    const newData = newBuffer.getChannelData(ch);
    let writeIdx = 0;
    for (let i = 0; i < startSample; i++) {
      newData[writeIdx++] = oldData[i];
    }
    for (let i = endSample; i < oldData.length; i++) {
      newData[writeIdx++] = oldData[i];
    }
  }
  return newBuffer;
}

// Extract sub-region
function extractRegion(buffer, startSec, endSec) {
  const startSample = Math.floor(startSec * buffer.sampleRate);
  const endSample = Math.min(Math.floor(endSec * buffer.sampleRate), buffer.length);
  const length = endSample - startSample;
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, Math.max(1, length), buffer.sampleRate);
  const newBuffer = ctx.createBuffer(buffer.numberOfChannels, Math.max(1, length), buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const oldData = buffer.getChannelData(ch);
    const newData = newBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      newData[i] = oldData[startSample + i];
    }
  }
  return newBuffer;
}

export default function AudioEditor({ audioUrl, onSave, onClose }) {
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [waveform, setWaveform] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);
  const [silentRegions, setSilentRegions] = useState([]);
  const [selectedSilences, setSelectedSilences] = useState(new Set());
  const [showSilences, setShowSilences] = useState(false);
  const [detectingSilence, setDetectingsilence] = useState(false);
  const [silenceThreshold, setSilenceThreshold] = useState(-35);
  const [silenceMinDuration, setSilenceMinDuration] = useState(0.4);
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);

  const waveformRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceRef = useRef(null);
  const playStartRef = useRef(0);
  const animFrameRef = useRef(null);

  // Load audio
  useEffect(() => {
    if (!audioUrl) return;
    setLoading(true);
    decodeAudio(audioUrl).then(buffer => {
      setAudioBuffer(buffer);
      setWaveform(getWaveformPeaks(buffer, 1000));
      setLoading(false);
    }).catch(err => {
      console.error('Failed to decode audio:', err);
      setLoading(false);
    });
  }, [audioUrl]);

  const duration = audioBuffer?.duration || 0;

  // Playback
  const handlePlay = useCallback(() => {
    if (!audioBuffer) return;
    if (playing) {
      sourceRef.current?.stop();
      audioContextRef.current?.close();
      cancelAnimationFrame(animFrameRef.current);
      setPlaying(false);
      return;
    }

    const ctx = new AudioContext();
    audioContextRef.current = ctx;
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const startOffset = selectionStart != null ? selectionStart : currentTime;
    const endOffset = selectionEnd != null ? selectionEnd : duration;
    source.start(0, startOffset, endOffset - startOffset);
    sourceRef.current = source;
    playStartRef.current = ctx.currentTime - startOffset;
    setPlaying(true);

    const tick = () => {
      if (!ctx) return;
      const t = ctx.currentTime - playStartRef.current;
      setCurrentTime(t);
      if (t < endOffset) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);

    source.onended = () => {
      setPlaying(false);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [audioBuffer, playing, currentTime, selectionStart, selectionEnd, duration]);

  useEffect(() => {
    return () => {
      sourceRef.current?.stop?.();
      audioContextRef.current?.close?.();
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Waveform mouse interaction
  const getTimeFromX = (e) => {
    const rect = waveformRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.max(0, Math.min(duration, (x / rect.width) * duration));
  };

  const isDraggingRef = useRef(false);
  const handleWaveformMouseDown = (e) => {
    if (!audioBuffer) return;
    const t = getTimeFromX(e);
    setSelectionStart(t);
    setSelectionEnd(null);
    setCurrentTime(t);
    isDraggingRef.current = true;
  };

  const handleWaveformMouseMove = (e) => {
    if (!isDraggingRef.current) return;
    const t = getTimeFromX(e);
    setSelectionEnd(t);
  };

  const handleWaveformMouseUp = () => {
    isDraggingRef.current = false;
    // Normalize selection
    if (selectionStart != null && selectionEnd != null) {
      const s = Math.min(selectionStart, selectionEnd);
      const en = Math.max(selectionStart, selectionEnd);
      if (en - s < 0.05) {
        setSelectionStart(null);
        setSelectionEnd(null);
      } else {
        setSelectionStart(s);
        setSelectionEnd(en);
      }
    }
  };

  // Push to history before modifying
  const pushHistory = () => {
    setHistory(prev => [...prev, audioBuffer]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setAudioBuffer(prev);
    setWaveform(getWaveformPeaks(prev, 1000));
    setSelectionStart(null);
    setSelectionEnd(null);
    setSilentRegions([]);
    setSelectedSilences(new Set());
  };

  // CUT: remove selected region
  const handleCut = () => {
    if (selectionStart == null || selectionEnd == null || !audioBuffer) return;
    pushHistory();
    const s = Math.min(selectionStart, selectionEnd);
    const e = Math.max(selectionStart, selectionEnd);
    const newBuffer = spliceAudioBuffer(audioBuffer, s, e);
    setAudioBuffer(newBuffer);
    setWaveform(getWaveformPeaks(newBuffer, 1000));
    setSelectionStart(null);
    setSelectionEnd(null);
    setCurrentTime(s);
    setSilentRegions([]);
  };

  // TRIM: keep only selected region
  const handleTrim = () => {
    if (selectionStart == null || selectionEnd == null || !audioBuffer) return;
    pushHistory();
    const s = Math.min(selectionStart, selectionEnd);
    const e = Math.max(selectionStart, selectionEnd);
    const newBuffer = extractRegion(audioBuffer, s, e);
    setAudioBuffer(newBuffer);
    setWaveform(getWaveformPeaks(newBuffer, 1000));
    setSelectionStart(null);
    setSelectionEnd(null);
    setCurrentTime(0);
    setSilentRegions([]);
  };

  // SPLIT: mark current position (visual only, useful for conceptual split)
  // For audio editing, split = cut at playhead creating two logical segments

  // DETECT SILENCE
  const handleDetectSilence = () => {
    if (!audioBuffer) return;
    setDetectingsilence(true);
    setTimeout(() => {
      const regions = detectSilentRegions(audioBuffer, silenceThreshold, silenceMinDuration);
      setSilentRegions(regions);
      setSelectedSilences(new Set(regions.map((_, i) => i)));
      setShowSilences(true);
      setDetectingsilence(false);
    }, 50);
  };

  // DELETE SELECTED SILENCES
  const handleDeleteSelectedSilences = () => {
    if (selectedSilences.size === 0 || !audioBuffer) return;
    pushHistory();

    // Sort selected regions by start time descending so we can splice from end
    const toRemove = [...selectedSilences]
      .map(i => silentRegions[i])
      .sort((a, b) => b.start - a.start);

    let buf = audioBuffer;
    for (const region of toRemove) {
      // Keep a tiny bit at edges to avoid clicks (20ms)
      const keepMs = 0.02;
      const s = region.start + keepMs;
      const e = Math.max(s, region.end - keepMs);
      if (e > s) {
        buf = spliceAudioBuffer(buf, s, e);
      }
    }
    setAudioBuffer(buf);
    setWaveform(getWaveformPeaks(buf, 1000));
    setSilentRegions([]);
    setSelectedSilences(new Set());
    setShowSilences(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  const toggleSilenceSelection = (idx) => {
    setSelectedSilences(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // SAVE
  const handleSave = async () => {
    if (!audioBuffer) return;
    setSaving(true);
    const wavBlob = audioBufferToWav(audioBuffer);
    onSave?.(wavBlob, audioBuffer.duration);
    setSaving(false);
  };

  // DOWNLOAD
  const handleDownload = () => {
    if (!audioBuffer) return;
    const wavBlob = audioBufferToWav(audioBuffer);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'edited_audio.wav';
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 100);
    return `${m}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const hasSelection = selectionStart != null && selectionEnd != null && Math.abs(selectionEnd - selectionStart) > 0.05;
  const selMin = hasSelection ? Math.min(selectionStart, selectionEnd) : 0;
  const selMax = hasSelection ? Math.max(selectionStart, selectionEnd) : 0;

  if (loading) {
    return (
      <div className="bg-[#1a1a2e] rounded-lg p-6 flex items-center justify-center gap-2 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading audio...
      </div>
    );
  }

  if (!audioBuffer) {
    return (
      <div className="bg-[#1a1a2e] rounded-lg p-6 text-center text-gray-500">
        No audio to edit
      </div>
    );
  }

  return (
    <div className="bg-[#12122a] rounded-lg border border-gray-700/50 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 bg-[#1a1a2e] border-b border-gray-700/50 flex-wrap">
        <Button
          size="sm" variant="ghost"
          className="text-white hover:bg-white/10 gap-1.5 text-xs h-7"
          onClick={handlePlay}
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {playing ? 'Pause' : 'Play'}
        </Button>

        <div className="w-px h-4 bg-gray-600 mx-1" />

        <Button
          size="sm" variant="ghost"
          className="text-red-400 hover:bg-red-500/10 gap-1.5 text-xs h-7"
          onClick={handleCut}
          disabled={!hasSelection}
        >
          <Scissors className="w-3.5 h-3.5" /> Cut
        </Button>
        <Button
          size="sm" variant="ghost"
          className="text-amber-400 hover:bg-amber-500/10 gap-1.5 text-xs h-7"
          onClick={handleTrim}
          disabled={!hasSelection}
        >
          <Scissors className="w-3.5 h-3.5" /> Trim to Selection
        </Button>

        <div className="w-px h-4 bg-gray-600 mx-1" />

        <Button
          size="sm" variant="ghost"
          className="text-cyan-400 hover:bg-cyan-500/10 gap-1.5 text-xs h-7"
          onClick={handleDetectSilence}
          disabled={detectingSilence}
        >
          {detectingSilence ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />}
          Detect Silence
        </Button>

        <div className="w-px h-4 bg-gray-600 mx-1" />

        <Button
          size="sm" variant="ghost"
          className="text-gray-400 hover:bg-white/10 gap-1.5 text-xs h-7"
          onClick={handleUndo}
          disabled={history.length === 0}
        >
          <Undo2 className="w-3.5 h-3.5" /> Undo
        </Button>

        <div className="flex-1" />

        <span className="text-[10px] text-gray-500 font-mono mr-2">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        {hasSelection && (
          <Badge className="bg-blue-500/20 text-blue-300 text-[10px]">
            Selection: {formatTime(selMin)} → {formatTime(selMax)} ({(selMax - selMin).toFixed(1)}s)
          </Badge>
        )}

        <Button
          size="sm" variant="ghost"
          className="text-gray-400 hover:bg-white/10 text-xs h-7"
          onClick={handleDownload}
        >
          <Download className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-xs h-7 gap-1"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Save
        </Button>
        {onClose && (
          <Button size="sm" variant="ghost" className="text-gray-400 hover:bg-white/10 h-7" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Waveform */}
      <div
        ref={waveformRef}
        className="relative h-32 bg-[#0d0d1a] cursor-crosshair select-none mx-2 my-2 rounded overflow-hidden"
        onMouseDown={handleWaveformMouseDown}
        onMouseMove={handleWaveformMouseMove}
        onMouseUp={handleWaveformMouseUp}
        onMouseLeave={handleWaveformMouseUp}
      >
        {/* Waveform bars */}
        <div className="absolute inset-0 flex items-center">
          {waveform.map((peak, i) => (
            <div
              key={i}
              className="flex-1 flex items-center justify-center"
            >
              <div
                className={`w-px rounded-full transition-colors ${
                  showSilences && silentRegions.some(r => {
                    const pos = (i / waveform.length) * duration;
                    return pos >= r.start && pos <= r.end;
                  })
                    ? 'bg-red-400/60'
                    : 'bg-blue-400/70'
                }`}
                style={{ height: `${Math.max(2, peak * 100)}%` }}
              />
            </div>
          ))}
        </div>

        {/* Selection overlay */}
        {hasSelection && (
          <div
            className="absolute top-0 bottom-0 bg-blue-500/20 border-l border-r border-blue-400/50"
            style={{
              left: `${(selMin / duration) * 100}%`,
              width: `${((selMax - selMin) / duration) * 100}%`,
            }}
          />
        )}

        {/* Silent regions overlay */}
        {showSilences && silentRegions.map((region, i) => (
          <div
            key={i}
            className={`absolute top-0 bottom-0 cursor-pointer transition-colors ${
              selectedSilences.has(i) ? 'bg-red-500/30 border-red-400/60' : 'bg-yellow-500/15 border-yellow-400/30'
            } border-l border-r`}
            style={{
              left: `${(region.start / duration) * 100}%`,
              width: `${((region.end - region.start) / duration) * 100}%`,
            }}
            onClick={(e) => { e.stopPropagation(); toggleSilenceSelection(i); }}
          />
        ))}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />
      </div>

      {/* Silence Controls */}
      {showSilences && silentRegions.length > 0 && (
        <div className="px-3 pb-3">
          <div className="bg-[#1a1a2e] rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-300">
                {silentRegions.length} silent regions detected · {selectedSilences.size} selected
              </span>
              <div className="flex gap-1.5">
                <Button
                  size="sm" variant="ghost"
                  className="text-xs h-6 text-gray-400"
                  onClick={() => setSelectedSilences(new Set(silentRegions.map((_, i) => i)))}
                >
                  Select All
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="text-xs h-6 text-gray-400"
                  onClick={() => setSelectedSilences(new Set())}
                >
                  Deselect All
                </Button>
                <Button
                  size="sm"
                  className="text-xs h-6 bg-red-600 hover:bg-red-700 gap-1"
                  onClick={handleDeleteSelectedSilences}
                  disabled={selectedSilences.size === 0}
                >
                  <Trash2 className="w-3 h-3" /> Delete Selected
                </Button>
              </div>
            </div>

            {/* Silence threshold controls */}
            <div className="flex items-center gap-4 text-[10px] text-gray-500">
              <div className="flex items-center gap-1.5">
                <span>Threshold:</span>
                <Slider
                  value={[silenceThreshold]}
                  onValueChange={([v]) => setSilenceThreshold(v)}
                  min={-60}
                  max={-15}
                  step={1}
                  className="w-20"
                />
                <span>{silenceThreshold}dB</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>Min duration:</span>
                <Slider
                  value={[silenceMinDuration]}
                  onValueChange={([v]) => setSilenceMinDuration(v)}
                  min={0.1}
                  max={2}
                  step={0.1}
                  className="w-20"
                />
                <span>{silenceMinDuration.toFixed(1)}s</span>
              </div>
              <Button
                size="sm" variant="ghost"
                className="text-[10px] h-5 text-cyan-400"
                onClick={handleDetectSilence}
              >
                Re-detect
              </Button>
            </div>

            {/* Silence list */}
            <div className="max-h-24 overflow-y-auto space-y-0.5">
              {silentRegions.map((region, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-2 py-0.5 rounded text-[10px] cursor-pointer transition-colors ${
                    selectedSilences.has(i) ? 'bg-red-500/20 text-red-300' : 'bg-white/5 text-gray-500 hover:bg-white/10'
                  }`}
                  onClick={() => toggleSilenceSelection(i)}
                >
                  <input
                    type="checkbox"
                    checked={selectedSilences.has(i)}
                    onChange={() => toggleSilenceSelection(i)}
                    className="w-3 h-3"
                  />
                  <span className="font-mono">{formatTime(region.start)} → {formatTime(region.end)}</span>
                  <span className="text-gray-600">({region.duration.toFixed(2)}s)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}