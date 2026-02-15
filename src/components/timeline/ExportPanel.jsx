import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Download, X, Film, Music, FileText, Package,
  CheckCircle, AlertCircle, Loader2, Image, Volume2
} from 'lucide-react';

function downloadUrl(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadBlob(content, filename, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  URL.revokeObjectURL(url);
}

export default function ExportPanel({
  project,
  scenesWithTiming,
  voiceoverUrl,
  musicUrl,
  musicVolume,
  totalDuration,
  onClose,
  onStatusUpdate,
}) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [completed, setCompleted] = useState([]);
  const [errors, setErrors] = useState([]);

  const projectName = (project?.name || 'video').replace(/[^a-zA-Z0-9_-]/g, '_');
  const orientation = project?.orientation || 'landscape';
  const resolution = orientation === 'portrait' ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };

  const videoScenes = scenesWithTiming.filter(s => s.video_url && !s.video_url.startsWith('freepik_task:') && !s.video_url.startsWith('runway_task:'));
  const imageScenes = scenesWithTiming.filter(s => s.image_url);
  const hasVoiceover = !!voiceoverUrl;
  const hasMusic = !!musicUrl;

  const buildManifest = () => ({
    project: {
      name: project?.name,
      orientation,
      resolution,
      total_duration_seconds: totalDuration,
      total_scenes: scenesWithTiming.length,
      visual_style: project?.visual_style,
      exported_at: new Date().toISOString(),
    },
    scenes: scenesWithTiming.map(s => ({
      scene_number: s.scene_number,
      start_time: s.start_time,
      duration: s.duration_seconds,
      narration: s.narration_text || '',
      image_url: s.image_url || null,
      video_url: (s.video_url && !s.video_url.startsWith('freepik_task:') && !s.video_url.startsWith('runway_task:')) ? s.video_url : null,
      sound_effect_url: s.sound_effect_url || null,
      sfx_volume: s.sfx_volume ?? 0.5,
      camera_movement: s.camera_movement || 'slow_pan',
      animation_speed: s.animation_speed || 'normal',
      transition_type: 'cut',
    })),
    audio: {
      voiceover_url: voiceoverUrl || null,
      voiceover_volume: 1.0,
      music_url: musicUrl || null,
      music_volume: musicVolume ?? 0.3,
    },
    editing_instructions: {
      software: 'Import into DaVinci Resolve, Premiere Pro, CapCut, or any NLE',
      steps: [
        '1. Import all scene videos/images into your editor',
        '2. Place them on the timeline in order using the start_time and duration values',
        '3. Import the voiceover audio and align to start at 0:00',
        '4. Import background music and set volume to ' + ((musicVolume ?? 0.3) * 100) + '%',
        '5. Add any SFX at their respective scene start times',
        '6. Export in ' + resolution.w + 'x' + resolution.h + ' (' + (orientation === 'portrait' ? '9:16' : '16:9') + ')',
      ],
    },
  });

  const buildSubtitlesSRT = () => {
    let srt = '';
    scenesWithTiming.forEach((s, i) => {
      if (!s.narration_text) return;
      const startH = Math.floor(s.start_time / 3600);
      const startM = Math.floor((s.start_time % 3600) / 60);
      const startS = Math.floor(s.start_time % 60);
      const startMs = Math.floor((s.start_time % 1) * 1000);
      const endTime = s.start_time + s.duration_seconds;
      const endH = Math.floor(endTime / 3600);
      const endM = Math.floor((endTime % 3600) / 60);
      const endS = Math.floor(endTime % 60);
      const endMs = Math.floor((endTime % 1) * 1000);
      const fmt = (h, m, sec, ms) =>
        `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
      srt += `${i + 1}\n${fmt(startH,startM,startS,startMs)} --> ${fmt(endH,endM,endS,endMs)}\n${s.narration_text}\n\n`;
    });
    return srt;
  };

  const handleExportManifest = () => {
    const manifest = buildManifest();
    downloadBlob(JSON.stringify(manifest, null, 2), `${projectName}-manifest.json`);
  };

  const handleExportSubtitles = () => {
    const srt = buildSubtitlesSRT();
    downloadBlob(srt, `${projectName}-subtitles.srt`, 'text/plain');
  };

  const handleExportAll = async () => {
    setExporting(true);
    setProgress(0);
    setCompleted([]);
    setErrors([]);

    const totalSteps = videoScenes.length + imageScenes.length + (hasVoiceover ? 1 : 0) + (hasMusic ? 1 : 0) + 2; // +2 for manifest & srt
    let done = 0;
    const bump = (label) => {
      done++;
      setProgress(Math.round((done / totalSteps) * 100));
      setCompleted(prev => [...prev, label]);
    };

    // 1. Download manifest
    setCurrentStep('Generating manifest...');
    handleExportManifest();
    bump('Project manifest');

    // 2. Download subtitles
    setCurrentStep('Generating subtitles...');
    handleExportSubtitles();
    bump('Subtitles (SRT)');

    // 3. Download voiceover
    if (hasVoiceover) {
      setCurrentStep('Downloading voiceover...');
      downloadUrl(voiceoverUrl, `${projectName}-voiceover.mp3`);
      bump('Voiceover audio');
    }

    // 4. Download music
    if (hasMusic) {
      setCurrentStep('Downloading music...');
      downloadUrl(musicUrl, `${projectName}-music.mp3`);
      bump('Background music');
    }

    // 5. Download scene videos
    for (const scene of videoScenes) {
      setCurrentStep(`Downloading scene ${scene.scene_number} video...`);
      downloadUrl(scene.video_url, `${projectName}-scene-${String(scene.scene_number).padStart(3,'0')}.mp4`);
      bump(`Scene ${scene.scene_number} video`);
      await new Promise(r => setTimeout(r, 500)); // stagger downloads
    }

    // 6. Download scene images (for scenes without video)
    const imagesOnly = imageScenes.filter(s => !videoScenes.find(v => v.id === s.id));
    for (const scene of imagesOnly) {
      setCurrentStep(`Downloading scene ${scene.scene_number} image...`);
      downloadUrl(scene.image_url, `${projectName}-scene-${String(scene.scene_number).padStart(3,'0')}.png`);
      bump(`Scene ${scene.scene_number} image`);
      await new Promise(r => setTimeout(r, 300));
    }

    // Update project status
    setCurrentStep('Finalizing...');
    await base44.entities.Projects.update(project.id, {
      status: 'compiled',
      current_step: 8,
    });
    if (onStatusUpdate) onStatusUpdate();

    setCurrentStep('');
    setExporting(false);
  };

  return (
    <Card className="mb-6 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="w-5 h-5 text-green-600" />
            Export & Compile Video
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Asset Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg p-3 border text-center">
            <Film className="w-5 h-5 text-blue-600 mx-auto mb-1" />
            <p className="text-xl font-bold">{videoScenes.length}</p>
            <p className="text-xs text-gray-500">Videos Ready</p>
          </div>
          <div className="bg-white rounded-lg p-3 border text-center">
            <Image className="w-5 h-5 text-purple-600 mx-auto mb-1" />
            <p className="text-xl font-bold">{imageScenes.length}</p>
            <p className="text-xs text-gray-500">Images</p>
          </div>
          <div className="bg-white rounded-lg p-3 border text-center">
            <Volume2 className="w-5 h-5 text-green-600 mx-auto mb-1" />
            <p className="text-xl font-bold">{hasVoiceover ? '✓' : '—'}</p>
            <p className="text-xs text-gray-500">Voiceover</p>
          </div>
          <div className="bg-white rounded-lg p-3 border text-center">
            <Music className="w-5 h-5 text-amber-600 mx-auto mb-1" />
            <p className="text-xl font-bold">{hasMusic ? '✓' : '—'}</p>
            <p className="text-xs text-gray-500">Music</p>
          </div>
        </div>

        {/* Export Info */}
        <div className="bg-white rounded-lg p-4 border text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-500">Resolution</span>
            <span className="font-medium">{resolution.w}x{resolution.h} ({orientation === 'portrait' ? '9:16' : '16:9'})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total Duration</span>
            <span className="font-medium">{Math.floor(totalDuration / 60)}m {Math.round(totalDuration % 60)}s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Visual Style</span>
            <span className="font-medium capitalize">{(project?.visual_style || 'none').replace(/_/g, ' ')}</span>
          </div>
        </div>

        {/* Individual Downloads */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Quick Downloads</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExportManifest}>
              <FileText className="w-3.5 h-3.5 mr-1" /> Manifest (JSON)
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportSubtitles}>
              <FileText className="w-3.5 h-3.5 mr-1" /> Subtitles (SRT)
            </Button>
            {hasVoiceover && (
              <Button variant="outline" size="sm" onClick={() => downloadUrl(voiceoverUrl, `${projectName}-voiceover.mp3`)}>
                <Volume2 className="w-3.5 h-3.5 mr-1" /> Voiceover
              </Button>
            )}
            {hasMusic && (
              <Button variant="outline" size="sm" onClick={() => downloadUrl(musicUrl, `${projectName}-music.mp3`)}>
                <Music className="w-3.5 h-3.5 mr-1" /> Music
              </Button>
            )}
          </div>
        </div>

        {/* Progress */}
        {exporting && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              {currentStep}
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-gray-500">{progress}% complete</p>
          </div>
        )}

        {/* Completed items */}
        {completed.length > 0 && !exporting && (
          <div className="bg-white rounded-lg p-3 border max-h-40 overflow-y-auto">
            <p className="text-xs font-medium text-green-700 mb-2 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> {completed.length} files exported
            </p>
            <div className="flex flex-wrap gap-1">
              {completed.map((item, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">{item}</Badge>
              ))}
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="bg-red-50 rounded-lg p-3 border border-red-200">
            {errors.map((err, i) => (
              <p key={i} className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {err}
              </p>
            ))}
          </div>
        )}

        {/* Main Export Button */}
        <Button
          onClick={handleExportAll}
          disabled={exporting || scenesWithTiming.length === 0}
          className="w-full bg-green-600 hover:bg-green-700 h-12 text-base"
        >
          {exporting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Exporting...
            </>
          ) : (
            <>
              <Download className="w-5 h-5 mr-2" /> Export All Assets & Compile
            </>
          )}
        </Button>

        <p className="text-[11px] text-gray-400 text-center leading-tight">
          Downloads all scene videos, images, voiceover, music, subtitles, and a project manifest.
          Import into DaVinci Resolve, Premiere Pro, CapCut, or any video editor to assemble your final video.
        </p>
      </CardContent>
    </Card>
  );
}