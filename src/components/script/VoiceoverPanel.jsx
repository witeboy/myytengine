import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Mic, Play, Pause, Download, Volume2, Square } from 'lucide-react';

export default function VoiceoverPanel({ project, script, onUpdate }) {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const audioRef = useRef(null);
  const previewAudioRef = useRef(null);
  const [previewingVoice, setPreviewingVoice] = useState(null);

  // Fetch production settings for existing voiceover
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoadingVoices(true);
      const [voiceRes, settingsRes] = await Promise.all([
        base44.functions.invoke('listVoices', {}),
        base44.entities.ProductionSettings.filter({ project_id: project.id }),
      ]);
      setVoices(voiceRes.data?.voices || []);
      if (settingsRes.length > 0) {
        setSettings(settingsRes[0]);
        if (settingsRes[0].selected_voice_id) setSelectedVoice(settingsRes[0].selected_voice_id);
      }
      setLoadingVoices(false);
    };
    if (project?.id) fetchData();
  }, [project?.id]);

  const handleGenerate = async () => {
    if (!script?.id || !selectedVoice) return;
    setGenerating(true);
    setError('');

    const res = await base44.functions.invoke('generateVoiceover', {
      project_id: project.id,
      script_id: script.id,
      voice_id: selectedVoice,
    });

    if (res.data?.error) {
      setError(res.data.error);
      setGenerating(false);
      return;
    }

    const taskId = res.data?.task_id;

    // Save voice selection to production settings
    if (settings) {
      await base44.entities.ProductionSettings.update(settings.id, {
        selected_voice_id: selectedVoice,
        voiceover_status: 'generating',
        generation_task_id: taskId,
      });
    } else {
      const created = await base44.entities.ProductionSettings.create({
        project_id: project.id,
        selected_voice_id: selectedVoice,
        voiceover_status: 'generating',
        generation_task_id: taskId,
      });
      setSettings(created);
    }

    // Poll using checkVoiceoverStatus which checks the task and updates Projects entity
    const pollInterval = setInterval(async () => {
      const statusRes = await base44.functions.invoke('checkVoiceoverStatus', {
        task_id: taskId,
        project_id: project.id,
      });
      const status = statusRes.data?.status;
      if (status === 'done') {
        // Update production settings with the audio URL
        const settingsRes = await base44.entities.ProductionSettings.filter({ project_id: project.id });
        if (settingsRes[0]) {
          await base44.entities.ProductionSettings.update(settingsRes[0].id, {
            voiceover_status: 'completed',
            voiceover_url: statusRes.data?.audio_url,
          });
          setSettings({ ...settingsRes[0], voiceover_status: 'completed', voiceover_url: statusRes.data?.audio_url });
        }
        setGenerating(false);
        clearInterval(pollInterval);
        onUpdate?.();
      } else if (status === 'failed') {
        setError(statusRes.data?.error_message || 'Voiceover generation failed');
        setGenerating(false);
        clearInterval(pollInterval);
      }
    }, 5000);

    // Stop polling after 5 min
    setTimeout(() => {
      clearInterval(pollInterval);
      if (generating) {
        setError('Voiceover generation timed out. Check back later.');
        setGenerating(false);
      }
    }, 300000);
  };

  const handlePreviewVoice = (voice) => {
    const previewUrl = voice.preview_url;
    if (!previewUrl) return;

    // If already previewing this voice, stop it
    if (previewingVoice === voice.voice_id && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      setPreviewingVoice(null);
      return;
    }

    // Stop any current preview
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }

    const audio = new Audio(previewUrl);
    previewAudioRef.current = audio;
    setPreviewingVoice(voice.voice_id);
    audio.play();
    audio.onended = () => setPreviewingVoice(null);
    audio.onerror = () => setPreviewingVoice(null);
  };

  // Cleanup preview audio on unmount
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  const handleDownload = () => {
    if (!settings?.voiceover_url) return;
    const a = document.createElement('a');
    a.href = settings.voiceover_url;
    a.download = `${project.name || 'voiceover'}.mp3`;
    a.click();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Volume2 className="w-4 h-4" /> Voiceover
          {settings?.voiceover_status === 'completed' && (
            <Badge className="bg-green-100 text-green-800 text-xs">Ready</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Voice Selection */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">Select Voice</label>
          {loadingVoices ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading voices...
            </div>
          ) : (
            <>
              <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a voice..." />
                </SelectTrigger>
                <SelectContent>
                  {voices.map(v => (
                    <SelectItem key={v.voice_id} value={v.voice_id}>
                      {v.name} {v.labels?.accent ? `(${v.labels.accent})` : ''} {v.labels?.gender ? `· ${v.labels.gender}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Voice Preview Cards */}
              {voices.length > 0 && (
                <div className="mt-3 max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {voices
                    .filter(v => v.preview_url)
                    .slice(0, 20)
                    .map(v => {
                      const isSelected = selectedVoice === v.voice_id;
                      const isPreviewing = previewingVoice === v.voice_id;
                      return (
                        <div
                          key={v.voice_id}
                          className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all text-sm ${
                            isSelected ? 'bg-purple-50 border-purple-300' : 'bg-white hover:bg-gray-50 border-gray-200'
                          }`}
                          onClick={() => setSelectedVoice(v.voice_id)}
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); handlePreviewVoice(v); }}
                            className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                              isPreviewing ? 'bg-purple-600 text-white' : 'bg-gray-100 hover:bg-purple-100 text-gray-600 hover:text-purple-700'
                            }`}
                          >
                            {isPreviewing ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{v.name}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {[v.labels?.accent, v.labels?.gender, v.labels?.age, v.labels?.use_case].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          {isSelected && (
                            <Badge className="bg-purple-100 text-purple-700 text-[10px] flex-shrink-0">Selected</Badge>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={generating || !selectedVoice || !script}
          className="w-full bg-purple-600 hover:bg-purple-700"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating Voiceover...</>
          ) : (
            <><Mic className="w-4 h-4 mr-2" /> Generate Voiceover</>
          )}
        </Button>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Audio Player */}
        {settings?.voiceover_url && settings.voiceover_status === 'completed' && (
          <div className="bg-gray-50 p-4 rounded-lg space-y-3">
            <audio
              ref={audioRef}
              src={settings.voiceover_url}
              onEnded={() => setPlaying(false)}
              className="hidden"
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={togglePlay}>
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <div className="flex-1">
                <p className="text-sm font-medium">Voiceover Audio</p>
                <p className="text-xs text-gray-500">
                  {settings.total_duration_seconds ? `${Math.round(settings.total_duration_seconds / 60)} min` : 'Ready to play'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="w-3.5 h-3.5 mr-1" /> Download
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}