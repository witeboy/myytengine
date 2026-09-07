import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { renderClipAndVoice } from '@/lib/renderClipAndVoice';
import { Download, Loader2, Mic2 } from 'lucide-react';

export default function ClipAndVoicePanel({ clip, words, videoUrl }) {
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [blob, setBlob] = useState(null);

  const download = output => {
    const url = URL.createObjectURL(output); const link = document.createElement('a');
    link.href = url; link.download = `${(clip.title || 'clip').replace(/[^a-z0-9]+/gi, '_')}_clip_and_voice.mp4`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const create = async () => {
    if (blob) return download(blob);
    setStatus('working'); setError(''); setMessage('Writing voiceover and selecting the best AI33 voice…');
    try {
      const clipTranscript = words.filter(word => word.start >= clip.start && word.end <= clip.end).map(word => word.word).join(' ');
      const started = await base44.functions.invoke('clipAndVoice', { action: 'start', clip, clip_transcript: clipTranscript });
      let result = started.data; setMessage(`Generating ${result.voice.name}, Suno music and SFX…`);
      for (let attempt = 0; attempt < 90 && result.status !== 'ready'; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 8000));
        result = (await base44.functions.invoke('clipAndVoice', { action: 'poll', tasks: result.tasks || started.data.tasks })).data;
        if (result.error) throw new Error(result.error);
        setMessage(`Generating audio… ${result.progress || 0}%`);
      }
      if (result.status !== 'ready') throw new Error('Audio generation timed out. Please try again.');
      const output = await renderClipAndVoice({ videoUrl, clip, assets: result.assets, onProgress: progress => setMessage(progress.message) });
      setBlob(output); setStatus('ready'); download(output);
    } catch (err) { setError(err.message); setStatus('idle'); }
  };

  return <div className="space-y-1"><Button size="sm" variant="outline" className="w-full h-8 text-xs border-blue-300 text-blue-700" onClick={create} disabled={status === 'working'}>{status === 'working' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : status === 'ready' ? <Download className="w-3 h-3 mr-1" /> : <Mic2 className="w-3 h-3 mr-1" />}{status === 'working' ? message : status === 'ready' ? 'Download Clip and Voice' : 'Clip and Voice'}</Button>{error && <p className="text-[10px] text-red-600">{error}</p>}</div>;
}