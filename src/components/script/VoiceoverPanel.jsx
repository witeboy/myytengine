import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Mic, Play, Pause, Download, Volume2 } from 'lucide-react';

export default function VoiceoverPanel({ project, script, onUpdate }) {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const audioRef = useRef(null);

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

    // Save voice selection to production settings
    if (settings) {
      await base44.entities.ProductionSettings.update(settings.id, {
        selected_voice_id: selectedVoice,
        voiceover_status: 'generating',
        generation_task_id: res.data?.task_id,
      });
    } else {
      await base44.entities.ProductionSettings.create({
        project_id: project.id,
        selected_voice_id: selectedVoice,
        voiceover_status: 'generating',
        generation_task_id: res.data?.task_id,
      });
    }

    // Poll for completion
    const pollInterval = setInterval(async () => {
      const updated = await base44.entities.ProductionSettings.filter({ project_id: project.id });
      if (updated[0]?.voiceover_status === 'completed') {
        setSettings(updated[0]);
        setGenerating(false);
        clearInterval(pollInterval);
      }
    }, 5000);

    // Stop polling after 5 min
    setTimeout(() => {
      clearInterval(pollInterval);
      setGenerating(false);
    }, 300000);
  };

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
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a voice..." />
              </SelectTrigger>
              <SelectContent>
                {voices.map(v => (
                  <SelectItem key={v.voice_id} value={v.voice_id}>
                    {v.name} {v.labels?.accent ? `(${v.labels.accent})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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