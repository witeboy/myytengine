import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Play, Pause, Scissors, Undo2, ScanSearch, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { base44 } from '@/api/base44Client';

// Decode audio file into AudioBuffer
async function decodeAudio(url) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  ctx.close();
  return audioBuffer;
}

function getWaveformPeaks(audioBuffer, numPeaks = 500) {
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

function detectSilentRegions(audioBuffer, thresholdDb = -35, minDurationSec = 0.4) {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const threshold = Math.pow(10, thresholdDb / 20);
  const minSamples = Math.floor(minDurationSec * sampleRate);
  const blockSize = Math.floor(sampleRate * 0.01);
  const regions = [];
  let silenceStart = null;
  for (let i = 0; i < channelData.length; i += blockSize) {
    let rms = 0;
    const end = Math.min(i + blockSize, channelData.length);
    for (let j = i; j < end; j++) rms += channelData[j] * channelData[j];
    rms = Math.sqrt(rms / (end - i));
    if (rms < threshold) {
      if (silenceStart === null) silenceStart = i;
    } else {
      if (silenceStart !== null) {
        if (i - silenceStart >= minSamples) {
          regions.push({ start: silenceStart / sampleRate, end: i / sampleRate, duration: (i - silenceStart) / sampleRate });
        }
        silenceStart = null;
      }
    }
  }
  if (silenceStart !== null && channelData.length - silenceStart >= minSamples) {
    regions.push({ start: silenceStart / sampleRate, end: channelData.length / sampleRate, duration: (channelData.length - silenceStart) / sampleRate });
  }
  return regions;
}

function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const samples = buffer.length;
  const dataSize = samples * blockAlign;
  const bufferSize = 44 + dataSize;
  const wav = new ArrayBuffer(bufferSize);
  const view = new DataView(wav);
  const writeString = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeString(0, 'RIFF'); view.setUint32(4, bufferSize - 8, true); writeString(8, 'WAVE');
  writeString(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true); writeString(36, 'data'); view.setUint32(40, dataSize, true);
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

function spliceAudioBuffer(buffer, startSec, endSec) {
  const startSample = Math.floor(startSec * buffer.sampleRate);
  const endSample = Math.floor(endSec * buffer.sampleRate);
  const newLength = buffer.length - (endSample - startSample);
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, Math.max(1, newLength), buffer.sampleRate);
  const newBuffer = ctx.createBuffer(buffer.numberOfChannels, Math.max(1, newLength), buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const oldData = buffer.getChannelData(ch);
    const newData = newBuffer.getChannelData(ch);
    let writeIdx = 0;
    for (let i = 0; i < startSample; i++) newData[writeIdx++] = oldData[i];
    for (let i = endSample; i < oldData.length; i++) newData[writeIdx++] = oldData[i];
  }
  return newBuffer;
}

function extractRegion(buffer, startSec, endSec) {
  const startSample = Math.floor(startSec * buffer.sampleRate);
  const endSample = Math.min(Math.floor(endSec * buffer.sampleRate), buffer.length);
  const length = endSample - startSample;
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, Math.max(1, length), buffer.sampleRate);
  const newBuffer = ctx.createBuffer(buffer.numberOfChannels, Math.max(1, length), buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const oldData = buffer.getChannelData(ch);
    const newData = newBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) newData[i] = oldData[startSample + i];
  }
  return newBuffer;
}

export default function InlineWaveform({
  audioUrl,
  trackColor = 'blue',        // blue, green, amber
  pixelsPerSecond,
  totalTimelineDuration,
  currentTime,
  onSeek,
  isEditing,
  onStartEdit,
  onStopEdit,
  onSave,                     // async (wavBlob, newDuration) => void
  label,
  trackDuration,              // actual duration of this audio
}) {
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [waveform, setWaveform] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);
  const [silentRegions, setSilentRegions] = useState([]);
  const [selectedSilences, setSelectedSilences] = useState(new Set());
  const [showSilences, setShowSilences] = useState(false);
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [previewAudio, setPreviewAudio] = useState(null);

  const waveformRef = useRef(null);
  const isDraggingRef = useRef(false);

  const colorMap = {
    blue: { bg: 'bg-blue-500/15', border: 'border-blue-500/30', bar: 'bg-blue-400/70', silenceBar: 'bg-red-400/60', sel: 'bg-blue-500/25', selBorder: 'border-blue-400/50', accent: 'text-blue-400', accentBg: 'bg-blue-500/20' },
    green: { bg: 'bg-green-500/15', border: 'border-green-500/30', bar: 'bg-green-400/70', silenceBar: 'bg-red-400/60', sel: 'bg-green-500/25', selBorder: 'border-green-400/50', accent: 'text-green-400', accentBg: 'bg-green-500/20' },
    amber: { bg: 'bg-amber-500/15', border: 'border-amber-500/30', bar: 'bg-amber-400/70', silenceBar: 'bg-red-400/60', sel: 'bg-amber-500/25', selBorder: 'border-amber-400/50', accent: 'text-amber-400', accentBg: 'bg-amber-500/20' },
  };
  const c = colorMap[trackColor] || colorMap.blue;

  const duration = audioBuffer?.duration || trackDuration || 0;
  const displayWidth = (trackDuration || totalTimelineDuration) * pixelsPerSecond;

  // Load audio when entering edit mode
  useEffect(() => {
    if (!isEditing || !audioUrl || audioBuffer) return;
    setLoading(true);
    decodeAudio(audioUrl).then(buffer => {
      setAudioBuffer(buffer);
      setWaveform(getWaveformPeaks(buffer, Math.max(200, Math.floor(displayWidth))));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [isEditing, audioUrl]);

  // Recalc waveform if buffer changes (after cut/trim)
  useEffect(() => {
    if (!audioBuffer) return;
    setWaveform(getWaveformPeaks(audioBuffer, Math.max(200, Math.floor(displayWidth))));
  }, [audioBuffer, displayWidth]);

  const hasSelection = selectionStart != null && selectionEnd != null && Math.abs(selectionEnd - selectionStart) > 0.05;
  const selMin = hasSelection ? Math.min(selectionStart, selectionEnd) : 0;
  const selMax = hasSelection ? Math.max(selectionStart, selectionEnd) : 0;

  const getTimeFromX = (e) => {
    const rect = waveformRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.max(0, Math.min(duration, (x / rect.width) * duration));
  };

  const handleMouseDown = (e) => {
    if (!isEditing || !audioBuffer) return;
    e.stopPropagation();
    const t = getTimeFromX(e);
    setSelectionStart(t);
    setSelectionEnd(null);
    isDraggingRef.current = true;
  };

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current) return;
    e.stopPropagation();
    setSelectionEnd(getTimeFromX(e));
  };

  const handleMouseUp = (e) => {
    if (!isDraggingRef.current) return;
    e.stopPropagation();
    isDraggingRef.current = false;
    if (selectionStart != null && selectionEnd != null) {
      const s = Math.min(selectionStart, selectionEnd);
      const en = Math.max(selectionStart, selectionEnd);
      if (en - s < 0.05) { setSelectionStart(null); setSelectionEnd(null); }
      else { setSelectionStart(s); setSelectionEnd(en); }
    }
  };

  // Preview: click on a region to hear it
  const handlePreviewClick = (e) => {
    if (!isEditing || !audioBuffer) return;
    e.stopPropagation();
    const t = getTimeFromX(e);
    // Play a short preview from this point
    if (previewAudio) { previewAudio.pause(); }
    const ctx = new AudioContext();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start(0, t, Math.min(3, duration - t)); // play 3s preview
    setPreviewAudio({ pause: () => { source.stop(); ctx.close(); } });
    source.onended = () => ctx.close();
  };

  const pushHistory = () => setHistory(prev => [...prev, audioBuffer]);

  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setAudioBuffer(prev);
    setSelectionStart(null); setSelectionEnd(null);
    setSilentRegions([]); setSelectedSilences(new Set()); setShowSilences(false);
  };

  const handleCut = () => {
    if (!hasSelection || !audioBuffer) return;
    pushHistory();
    const newBuffer = spliceAudioBuffer(audioBuffer, selMin, selMax);
    setAudioBuffer(newBuffer);
    setSelectionStart(null); setSelectionEnd(null);
    setSilentRegions([]);
  };

  const handleTrim = () => {
    if (!hasSelection || !audioBuffer) return;
    pushHistory();
    const newBuffer = extractRegion(audioBuffer, selMin, selMax);
    setAudioBuffer(newBuffer);
    setSelectionStart(null); setSelectionEnd(null);
    setSilentRegions([]);
  };

  const handleDetectSilence = () => {
    if (!audioBuffer) return;
    const regions = detectSilentRegions(audioBuffer, -35, 0.4);
    setSilentRegions(regions);
    setSelectedSilences(new Set(regions.map((_, i) => i)));
    setShowSilences(true);
  };

  const handleDeleteSilences = () => {
    if (selectedSilences.size === 0 || !audioBuffer) return;
    pushHistory();
    const toRemove = [...selectedSilences].map(i => silentRegions[i]).sort((a, b) => b.start - a.start);
    let buf = audioBuffer;
    for (const region of toRemove) {
      const s = region.start + 0.02;
      const e = Math.max(s, region.end - 0.02);
      if (e > s) buf = spliceAudioBuffer(buf, s, e);
    }
    setAudioBuffer(buf);
    setSilentRegions([]); setSelectedSilences(new Set()); setShowSilences(false);
    setSelectionStart(null); setSelectionEnd(null);
  };

  const handleSaveEdit = async () => {
    if (!audioBuffer) return;
    setSaving(true);
    const wavBlob = audioBufferToWav(audioBuffer);
    await onSave?.(wavBlob, audioBuffer.duration);
    setSaving(false);
    setHistory([]);
    setSilentRegions([]); setShowSilences(false);
    setSelectionStart(null); setSelectionEnd(null);
    onStopEdit?.();
  };

  const handleCancelEdit = () => {
    // Reset to original
    setAudioBuffer(null);
    setHistory([]);
    setSilentRegions([]); setShowSilences(false);
    setSelectionStart(null); setSelectionEnd(null);
    onStopEdit?.();
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Non-edit mode: simple colored bar
  if (!isEditing) {
    return (
      <div
        className={`absolute top-0.5 bottom-0.5 ${c.bg} border ${c.border} rounded flex items-center px-2 cursor-pointer hover:brightness-125 transition-all`}
        style={{ width: displayWidth }}
        onDoubleClick={(e) => { e.stopPropagation(); onStartEdit?.(); }}
        title="Double-click to edit waveform"
      >
        <div className="flex items-center gap-0.5 opacity-60">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`w-0.5 ${c.bar} rounded-full`} style={{ height: 3 + Math.random() * 10 }} />
          ))}
        </div>
        <span className={`text-[8px] ${c.accent} opacity-70 ml-1.5 truncate`}>{label}</span>
      </div>
    );
  }

  // Edit mode: full waveform with selection
  return (
    <div className="absolute top-0 bottom-0 left-0" style={{ width: displayWidth }}>
      {/* Edit toolbar floating above */}
      <div className="absolute -top-7 left-0 right-0 flex items-center gap-0.5 px-1 z-30 pointer-events-auto">
        <button onClick={handleCut} disabled={!hasSelection}
          className={`px-1.5 py-0.5 rounded text-[8px] font-medium transition-colors ${hasSelection ? 'bg-red-500/30 text-red-300 hover:bg-red-500/50' : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'}`}
          title="Cut selection">
          <Scissors className="w-2.5 h-2.5 inline mr-0.5" />Cut
        </button>
        <button onClick={handleTrim} disabled={!hasSelection}
          className={`px-1.5 py-0.5 rounded text-[8px] font-medium transition-colors ${hasSelection ? 'bg-amber-500/30 text-amber-300 hover:bg-amber-500/50' : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'}`}
          title="Keep only selection">
          <Scissors className="w-2.5 h-2.5 inline mr-0.5 rotate-90" />Trim
        </button>
        <button onClick={handleDetectSilence}
          className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-cyan-500/30 text-cyan-300 hover:bg-cyan-500/50 transition-colors"
          title="Find silent parts">
          <ScanSearch className="w-2.5 h-2.5 inline mr-0.5" />Silence
        </button>
        {showSilences && selectedSilences.size > 0 && (
          <button onClick={handleDeleteSilences}
            className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-red-500/30 text-red-300 hover:bg-red-500/50 transition-colors"
            title="Remove selected silences">
            <Trash2 className="w-2.5 h-2.5 inline mr-0.5" />{selectedSilences.size}
          </button>
        )}
        <button onClick={handleUndo} disabled={history.length === 0}
          className={`px-1.5 py-0.5 rounded text-[8px] font-medium transition-colors ${history.length > 0 ? 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50' : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'}`}
          title="Undo last edit">
          <Undo2 className="w-2.5 h-2.5 inline" />
        </button>

        <div className="flex-1" />

        {hasSelection && (
          <span className="text-[7px] text-gray-400 font-mono">
            {formatTime(selMin)}→{formatTime(selMax)} ({(selMax - selMin).toFixed(1)}s)
          </span>
        )}
        <span className="text-[7px] text-gray-500 font-mono">{formatTime(duration)}</span>

        <button onClick={handleSaveEdit} disabled={saving}
          className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-green-600 text-white hover:bg-green-700 transition-colors">
          {saving ? <Loader2 className="w-2.5 h-2.5 inline animate-spin" /> : <Check className="w-2.5 h-2.5 inline mr-0.5" />}Save
        </button>
        <button onClick={handleCancelEdit}
          className="px-1 py-0.5 rounded text-[8px] font-medium bg-gray-700/50 text-gray-400 hover:bg-gray-600/50 transition-colors">
          <X className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Waveform area */}
      <div
        ref={waveformRef}
        className={`absolute inset-0 ${c.bg} border ${isEditing ? 'border-white/30 ring-1 ring-white/20' : c.border} rounded cursor-crosshair select-none overflow-hidden`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handlePreviewClick}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full gap-1">
            <Loader2 className={`w-3 h-3 ${c.accent} animate-spin`} />
            <span className={`text-[8px] ${c.accent}`}>Loading...</span>
          </div>
        ) : (
          <>
            {/* Waveform bars */}
            <div className="absolute inset-0 flex items-center">
              {waveform.map((peak, i) => {
                const pos = (i / waveform.length) * duration;
                const isSilent = showSilences && silentRegions.some(r => pos >= r.start && pos <= r.end);
                return (
                  <div key={i} className="flex-1 flex items-center justify-center">
                    <div
                      className={`w-px rounded-full ${isSilent ? c.silenceBar : c.bar}`}
                      style={{ height: `${Math.max(4, peak * 90)}%` }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Selection overlay */}
            {hasSelection && (
              <div
                className={`absolute top-0 bottom-0 ${c.sel} border-l border-r ${c.selBorder}`}
                style={{ left: `${(selMin / duration) * 100}%`, width: `${((selMax - selMin) / duration) * 100}%` }}
              />
            )}

            {/* Silence overlays */}
            {showSilences && silentRegions.map((region, i) => (
              <div
                key={i}
                className={`absolute top-0 bottom-0 cursor-pointer ${selectedSilences.has(i) ? 'bg-red-500/30' : 'bg-yellow-500/15'} border-l border-r ${selectedSilences.has(i) ? 'border-red-400/50' : 'border-yellow-400/30'}`}
                style={{ left: `${(region.start / duration) * 100}%`, width: `${((region.end - region.start) / duration) * 100}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedSilences(prev => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    return next;
                  });
                }}
                title={`Silent: ${region.duration.toFixed(1)}s — click to toggle`}
              />
            ))}

            {/* Current time indicator inside waveform */}
            {duration > 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10 pointer-events-none"
                style={{ left: `${Math.min(100, (currentTime / duration) * 100)}%` }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}