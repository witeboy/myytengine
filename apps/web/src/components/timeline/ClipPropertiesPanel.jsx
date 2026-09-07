import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Image, Film, Mic, Copy, Camera, CheckCircle, Blend, Clapperboard
} from 'lucide-react';

const DEFAULT_TRANSITION_DURATION = 0.6;

const CINEMATIC_MOTIONS = [
  { id: 'zoom_in_center',  name: 'Push In',     description: 'Slowly drifts closer — holds at end' },
  { id: 'zoom_out_center', name: 'Pull Out',     description: 'Starts close, slowly reveals scene' },
  { id: 'pan_right_zoom',  name: 'Drift Right',  description: 'Drifts right while pushing in' },
  { id: 'pan_left_zoom',   name: 'Drift Left',   description: 'Drifts left while pushing in' },
  { id: 'push_in_top',     name: 'Drift Up',     description: 'Slowly rises while zooming in' },
  { id: 'push_in_bottom',  name: 'Drift Down',   description: 'Slowly descends while zooming in' },
  { id: 'diagonal_tl_br',  name: 'Diagonal ↘',   description: 'Drifts top-left to bottom-right' },
  { id: 'diagonal_tr_bl',  name: 'Diagonal ↙',   description: 'Drifts top-right to bottom-left' },
];

export default function ClipPropertiesPanel({ clip, audioBeatDuration, onUpdate, onApplyToAll }) {
  if (!clip) return <div className="h-full flex items-center justify-center text-xs text-gray-500">Select a clip</div>;
  const u = (k, v) => onUpdate({ ...clip, [k]: v });
  const isSynced  = Math.abs(clip.duration - audioBeatDuration) < 0.1;
  const motion    = CINEMATIC_MOTIONS.find(m => m.id === clip.cinematicMotion);
  const hasVideo  = !!clip.videoUrl;
  const hasBroll  = !!clip.brollUrl;
  const isVideo   = clip.mediaType === 'video';
  const isBroll   = clip.mediaType === 'broll';

  const handleMediaSwitch = (type) => {
    if (type === 'video' && !hasVideo) return;
    if (type === 'broll' && !hasBroll) return;
    onUpdate({ ...clip, mediaType: type });
  };

  return (
    <div className="h-full flex flex-col bg-[#12121f] p-3 space-y-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">Scene {clip.sceneNumber}</span>
        <Button size="sm" onClick={onApplyToAll} className="text-[10px] bg-cyan-600 hover:bg-cyan-700 px-2 py-1 h-auto gap-1">
          <Copy size={10} /> Apply to All
        </Button>
      </div>

      {/* Media Type Toggle */}
      <div className="p-3 bg-gray-800/60 rounded border border-gray-700 space-y-2">
        <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Media Source</label>
        <div className="flex gap-1.5">
          <button onClick={() => handleMediaSwitch('image')}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded text-xs font-medium transition-all ${
              !isVideo && !isBroll ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
            }`}>
            <Image size={12} /> Image
          </button>
          <button onClick={() => handleMediaSwitch('video')}
            title={hasVideo ? 'Use generated video' : 'No video generated'}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded text-xs font-medium transition-all ${
              isVideo ? 'bg-purple-600 text-white' : hasVideo ? 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white' : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}>
            <Film size={12} /> Video
          </button>
          <button onClick={() => handleMediaSwitch('broll')}
            title={hasBroll ? 'Use matched B-roll stock footage' : 'No B-roll — run Auto B-Roll'}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded text-xs font-medium transition-all ${
              isBroll ? 'bg-teal-600 text-white' : hasBroll ? 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white' : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}>
            <Clapperboard size={12} /> B-Roll
          </button>
        </div>
        {isVideo && hasVideo && (
          <p className="text-[9px] text-purple-300 flex items-center gap-1"><Film size={9} /> Playing generated video · speed auto-matched to beat</p>
        )}
        {isBroll && hasBroll && (
          <p className="text-[9px] text-teal-300 flex items-center gap-1"><Clapperboard size={9} /> Stock B-roll ({clip.brollSource || 'stock'}) · "{clip.brollQuery || ''}"</p>
        )}
        {!hasVideo && !hasBroll && (
          <p className="text-[9px] text-gray-500">Generate videos or run Auto B-Roll in Content Generation.</p>
        )}
      </div>

      <div className="p-3 bg-indigo-500/20 rounded border border-indigo-500/30">
        <div className="flex items-center gap-2 mb-1">
          <Mic size={14} className="text-indigo-400" />
          <label className="text-[10px] text-indigo-300">Audio Beat Duration</label>
        </div>
        <p className="text-xl text-white font-mono">{audioBeatDuration?.toFixed(1)}s</p>
      </div>

      {/* Video Speed Control */}
      {(isVideo || isBroll) && (hasVideo || hasBroll) && (() => {
        const rate    = clip.playbackRate ?? 1.0;
        const vidDur  = clip.videoDuration || 6;
        const beatDur = audioBeatDuration ?? clip.duration;
        const effectiveDur = parseFloat((vidDur / rate).toFixed(2));
        const autoRate = beatDur > vidDur ? Math.max(0.25, parseFloat((vidDur / beatDur).toFixed(3))) : 1.0;
        const isManual = clip.manualSpeed === true;
        const applyRate = (r, manual = true) => {
          const newEffective = vidDur / r;
          const newDur = r <= 1.0 ? Math.min(newEffective, beatDur) : beatDur;
          onUpdate({ ...clip, playbackRate: parseFloat(r.toFixed(3)), duration: parseFloat(newDur.toFixed(3)), manualSpeed: manual });
        };
        return (
          <div className="p-3 bg-[#0d1a2e] rounded border border-blue-800/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Film size={13} className="text-blue-400" />
                <label className="text-[10px] text-blue-300 font-medium uppercase tracking-wide">Playback Speed</label>
              </div>
              {isManual && <button onClick={() => applyRate(autoRate, false)} className="text-[9px] text-cyan-400 hover:text-cyan-300 underline">↺ Reset ({autoRate.toFixed(2)}×)</button>}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <span className="text-3xl font-mono text-white font-bold">{rate.toFixed(2)}</span><span className="text-lg text-gray-400 ml-0.5">×</span>
                {isManual ? <span className="ml-2 text-[9px] text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded">manual</span> : <span className="ml-2 text-[9px] text-cyan-400 bg-cyan-900/30 px-1.5 py-0.5 rounded">auto</span>}
              </div>
              <div className="text-right">
                <p className="text-[9px] text-gray-500">Source · Effective</p>
                <p className="text-xs font-mono text-white">{vidDur.toFixed(1)}s → <span className="text-cyan-300">{Math.min(effectiveDur, beatDur).toFixed(1)}s</span></p>
              </div>
            </div>
            <input type="range" min={0.25} max={2.0} step={0.05} value={rate} onChange={e => applyRate(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
            <div className="grid grid-cols-6 gap-1">
              {[0.25, 0.5, 0.75, 1.0, 1.5, 2.0].map(r => (
                <button key={r} onClick={() => applyRate(r)}
                  className={`py-1 rounded text-[9px] font-mono font-bold ${Math.abs(rate - r) < 0.03 ? 'bg-blue-600 text-white ring-1 ring-blue-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>{r}×</button>
              ))}
            </div>
          </div>
        );
      })()}

      <div className={`p-3 rounded border ${isSynced ? 'bg-green-500/20 border-green-500/30' : 'bg-yellow-500/20 border-yellow-500/30'}`}>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-gray-300">Video Duration</label>
          {isSynced && <span className="text-[9px] text-green-400 flex items-center gap-1"><CheckCircle size={10} /> Synced</span>}
        </div>
        <Input type="number" step="0.1" value={clip.duration?.toFixed(1)} onChange={e => u('duration', parseFloat(e.target.value) || 1)} className="h-8 text-xs bg-gray-800 border-gray-700" />
      </div>

      {clip.cinematicMotion && (
        <div className="p-3 bg-amber-500/20 rounded border border-amber-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Camera size={14} className="text-amber-400" /><label className="text-[10px] text-amber-300 font-medium">Cinematic Motion</label></div>
            <button onClick={() => u('cinematicMotion', null)} className="text-[10px] text-red-400 hover:text-red-300">Remove</button>
          </div>
          <div><p className="text-sm text-white font-medium">{motion?.name || clip.cinematicMotion}</p><p className="text-[10px] text-gray-400">{motion?.description}</p></div>
          <div>
            <div className="flex justify-between text-[10px] mb-1"><span className="text-amber-300 font-medium">Speed</span><span className="text-white font-mono">{clip.motionSpeed == null || clip.motionSpeed === 1.0 ? 'Normal' : clip.motionSpeed < 1.0 ? `${(1 / clip.motionSpeed).toFixed(1)}× slower` : `${clip.motionSpeed.toFixed(1)}× faster`}</span></div>
            <input type="range" min={0.1} max={3.0} step={0.05} value={clip.motionSpeed ?? 1.0} onChange={e => u('motionSpeed', parseFloat(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500" />
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-1"><span className="text-amber-300 font-medium">Intensity</span><span className="text-white font-mono">{clip.motionIntensity == null || clip.motionIntensity === 1.0 ? 'Normal' : clip.motionIntensity < 1.0 ? `${Math.round(clip.motionIntensity * 100)}% subtle` : `${Math.round(clip.motionIntensity * 100)}% strong`}</span></div>
            <input type="range" min={0.1} max={2.5} step={0.05} value={clip.motionIntensity ?? 1.0} onChange={e => u('motionIntensity', parseFloat(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500" />
          </div>
          {((clip.motionSpeed != null && clip.motionSpeed !== 1.0) || (clip.motionIntensity != null && clip.motionIntensity !== 1.0)) && (
            <button onClick={() => onUpdate({ ...clip, motionSpeed: 1.0, motionIntensity: 1.0 })} className="text-[10px] text-amber-400 hover:text-amber-300">Reset to defaults</button>
          )}
        </div>
      )}

      {clip.transition && (
        <div className="p-3 bg-purple-500/20 rounded border border-purple-500/30">
          <div className="flex items-center gap-2 mb-2"><Blend size={14} className="text-purple-400" /><label className="text-[10px] text-purple-300">Transition (Out)</label></div>
          <p className="text-sm text-white mb-2">{clip.transition}</p>
          <div className="mb-2">
            <div className="flex justify-between text-[10px] mb-1"><span className="text-gray-400">Duration</span><span className="text-white font-mono">{(clip.transitionDuration ?? DEFAULT_TRANSITION_DURATION).toFixed(1)}s</span></div>
            <input type="range" min={0.1} max={5.0} step={0.1} value={clip.transitionDuration ?? DEFAULT_TRANSITION_DURATION} onChange={e => u('transitionDuration', parseFloat(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
          </div>
          <button onClick={() => u('transition', null)} className="text-[10px] text-red-400 mt-2 hover:text-red-300">Remove transition</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-300">Mute audio</span>
        <Switch checked={clip.audioMuted || false} onCheckedChange={v => u('audioMuted', v)} />
      </div>
    </div>
  );
}