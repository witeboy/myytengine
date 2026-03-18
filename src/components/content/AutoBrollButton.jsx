import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Film, CheckCircle2, XCircle } from 'lucide-react';

export default function AutoBrollButton({ projectId, sceneCount, onComplete }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  if (sceneCount === 0) return null;

  const handleRun = async () => {
    setRunning(true);
    setResult(null);

    try {
      const res = await base44.functions.invoke('autoBrollPopulate', {
        project_id: projectId,
      });
      const data = res.data || res;
      setResult(data);
      if (onComplete) await onComplete();
    } catch (err) {
      console.error('Auto B-Roll failed:', err);
      setResult({ error: err.message });
    }

    setRunning(false);
    setTimeout(() => setResult(null), 8000);
  };

  return (
    <div className="relative">
      <Button
        onClick={handleRun}
        disabled={running}
        variant="outline"
        className="border-cyan-200 text-cyan-700 hover:bg-cyan-50"
      >
        {running ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-1" />
            Finding B-Roll...
          </>
        ) : (
          <>
            <Film className="w-4 h-4 mr-1" />
            Auto B-Roll
          </>
        )}
      </Button>

      {result && (
        <div className={`absolute top-full mt-1 right-0 z-50 rounded-lg p-3 shadow-lg text-xs w-72 ${
          result.error ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-cyan-50 border border-cyan-200 text-cyan-800'
        }`}>
          {result.error ? (
            <div className="flex items-start gap-2">
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>Failed: {result.error}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-600" />
                <p className="font-medium">
                  {result.populated}/{result.total} scenes matched with B-roll
                </p>
              </div>
              {result.results && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {result.results.slice(0, 12).map(r => (
                    <span
                      key={r.scene_number}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        r.status === 'populated' ? 'bg-green-100 text-green-700' :
                        r.status === 'no_match' ? 'bg-gray-100 text-gray-500' :
                        'bg-red-100 text-red-600'
                      }`}
                    >
                      S{r.scene_number}
                    </span>
                  ))}
                  {result.results.length > 12 && (
                    <span className="text-[10px] text-gray-400">+{result.results.length - 12} more</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}