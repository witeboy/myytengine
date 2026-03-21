import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, CheckCircle2, AlertTriangle, Loader2, X } from 'lucide-react';

export default function HealthCheckButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [showPanel, setShowPanel] = useState(false);

  const runCheck = async () => {
    setRunning(true);
    setResult(null);
    setShowPanel(true);
    try {
      const res = await base44.functions.invoke('healthCheck', {});
      setResult(res.data || res);
    } catch (e) {
      setResult({ error: e.message });
    }
    setRunning(false);
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={runCheck}
        disabled={running}
        className="gap-1.5 text-xs"
      >
        {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
        {running ? 'Pinging...' : 'Wake Functions'}
      </Button>

      {showPanel && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border rounded-lg shadow-xl z-50 p-3 max-h-[400px] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-700">Function Health</span>
            <button onClick={() => setShowPanel(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {running && (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Pinging all functions...
            </div>
          )}

          {result?.error && (
            <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{result.error}</div>
          )}

          {result?.report && (
            <div className="space-y-1">
              <div className="flex gap-2 mb-2">
                <Badge className="bg-green-100 text-green-700 text-[10px]">
                  {result.healthy} OK
                </Badge>
                {result.unhealthy > 0 && (
                  <Badge className="bg-red-100 text-red-700 text-[10px]">
                    {result.unhealthy} Down
                  </Badge>
                )}
              </div>
              {result.report.map((fn, i) => {
                const isOk = fn.status === 'ok' || (typeof fn.status === 'number' && fn.status < 500);
                return (
                  <div key={i} className={`flex items-center justify-between text-[11px] px-2 py-1 rounded ${isOk ? 'bg-green-50' : 'bg-red-50'}`}>
                    <div className="flex items-center gap-1.5">
                      {isOk
                        ? <CheckCircle2 className="w-3 h-3 text-green-600" />
                        : <AlertTriangle className="w-3 h-3 text-red-500" />
                      }
                      <span className={isOk ? 'text-green-800' : 'text-red-800'}>{fn.name}</span>
                    </div>
                    <span className="text-gray-400">{fn.ms}ms</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}