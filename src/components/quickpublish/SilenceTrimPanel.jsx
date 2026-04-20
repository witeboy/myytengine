import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VolumeX, Loader2, Scissors, Check } from 'lucide-react';

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function SilenceTrimPanel({ words, duration }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [cuts, setCuts] = useState([]);
  const [stats, setStats] = useState(null);
  const [aggressiveness, setAggressiveness] = useState('moderate');
  const [removeFillers, setRemoveFillers] = useState(true);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError('');
    try {
      const res = await base44.functions.invoke('detectSilencesAndFillers', {
        words, aggressiveness, remove_fillers: removeFillers,
      });
      if (res.data?.cuts) {
        setCuts(res.data.cuts);
        setStats(res.data.stats);
      } else {
        setError(res.data?.error || 'Analysis failed');
      }
    } catch (err) {
      setError(err.message || 'Analysis failed');
    }
    setAnalyzing(false);
  };

  if (!words?.length) return null;

  return (
    <div className="bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-200 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <VolumeX className="w-4 h-4 text-sky-600" />
          <span className="text-sm font-semibold text-sky-900">
            Silence + Filler Cleanup
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={aggressiveness} onValueChange={setAggressiveness}>
            <SelectTrigger className="h-7 text-[10px] w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="conservative">Conservative</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="aggressive">Aggressive</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="h-7 text-xs gap-1 bg-sky-600 hover:bg-sky-700"
          >
            {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scissors className="w-3 h-3" />}
            {analyzing ? 'Scanning...' : 'Scan'}
          </Button>
        </div>
      </div>

      {!stats && (
        <p className="text-[10px] text-sky-700">
          Detects long silences + filler words ("um", "uh", "you know") with timestamps. Apply cuts in your editor.
        </p>
      )}

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white rounded p-2 border border-sky-100">
              <p className="text-[9px] text-gray-500 uppercase">Cuts</p>
              <p className="text-base font-bold text-sky-700">{stats.total_cuts}</p>
            </div>
            <div className="bg-white rounded p-2 border border-sky-100">
              <p className="text-[9px] text-gray-500 uppercase">Fillers</p>
              <p className="text-base font-bold text-amber-600">{stats.filler_cuts}</p>
            </div>
            <div className="bg-white rounded p-2 border border-sky-100">
              <p className="text-[9px] text-gray-500 uppercase">Time saved</p>
              <p className="text-base font-bold text-green-600">{stats.total_seconds_trimmed}s</p>
            </div>
          </div>

          {duration > 0 && stats.total_seconds_trimmed > 0 && (
            <p className="text-[11px] text-sky-700 text-center">
              ✂️ Final duration: <strong>{fmt(duration - stats.total_seconds_trimmed)}</strong> (down from {fmt(duration)})
            </p>
          )}

          {cuts.length > 0 && (
            <div className="bg-white border border-sky-100 rounded p-2 max-h-48 overflow-y-auto space-y-1">
              {cuts.slice(0, 50).map((cut, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                  <Badge
                    variant="outline"
                    className={`text-[9px] ${cut.type === 'filler' ? 'border-amber-300 text-amber-700' : 'border-gray-300'}`}
                  >
                    {cut.type}
                  </Badge>
                  <span className="text-gray-500">{fmt(cut.start)} → {fmt(cut.end)}</span>
                  <span className="text-gray-400">({cut.duration}s)</span>
                  {cut.word && <span className="text-amber-700">"{cut.word}"</span>}
                </div>
              ))}
              {cuts.length > 50 && (
                <p className="text-[10px] text-gray-400 text-center pt-1">
                  + {cuts.length - 50} more cuts
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}