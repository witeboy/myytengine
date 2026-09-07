import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import ApiKeyField from '@/components/settings/ApiKeyField';
import {
  ArrowLeft, KeyRound, Loader2, ShieldCheck, AlertTriangle, Zap,
} from 'lucide-react';

export default function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [testingAll, setTestingAll] = useState(false);
  const [allResults, setAllResults] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => base44.keys.list(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['api-keys'] });

  const saveKey = async (provider, value) => {
    await base44.keys.set(provider, value);
    await invalidate();
  };

  const testKey = async (provider, value) => base44.keys.test(provider, value);

  const removeKey = async (provider) => {
    await base44.keys.remove(provider);
    await invalidate();
  };

  const settingsMutation = useMutation({
    mutationFn: (patch) => base44.keys.saveSettings(patch),
    onSuccess: invalidate,
  });

  const runTestAll = async () => {
    setTestingAll(true);
    setAllResults(null);
    try {
      const res = await base44.keys.testAll();
      setAllResults(res);
      await invalidate();
    } catch (err) {
      setAllResults({ results: [], error: err.message });
    } finally {
      setTestingAll(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const providers = data?.providers || [];
  const settings = data?.settings || {};
  const groups = [...new Set(providers.map((p) => p.group))];
  const missingCore = providers.filter((p) => p.tier === 'core' && !p.configured);
  const hasAssembly = providers.find((p) => p.id === 'ASSEMBLYAI_API_KEY')?.configured;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('Dashboard'))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-500 text-sm">API keys and generation preferences</p>
          </div>
          <Button variant="outline" size="sm" onClick={runTestAll} disabled={testingAll}>
            {testingAll
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Testing…</>
              : <><Zap className="w-3.5 h-3.5 mr-1.5" /> Test all</>}
          </Button>
        </div>

        {/* Status banner */}
        {missingCore.length > 0 ? (
          <Card className="mb-6 border-amber-200 bg-amber-50">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900 text-sm">
                  {missingCore.length} required {missingCore.length === 1 ? 'key is' : 'keys are'} missing
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Generation will fail until you add {missingCore.map((p) => p.label).join(', ')}.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-6 border-emerald-200 bg-emerald-50">
            <CardContent className="p-4 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-emerald-900 text-sm">All required keys configured</p>
                <p className="text-xs text-emerald-700 mt-1">
                  Keys are encrypted before storage and are never sent back to the browser.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {allResults?.results?.length > 0 && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-gray-900 mb-2">
                Tested {allResults.tested} {allResults.tested === 1 ? 'key' : 'keys'}
              </p>
              <div className="space-y-1">
                {allResults.results.map((r) => (
                  <p
                    key={r.provider}
                    className={`text-xs ${r.ok ? 'text-emerald-600' : 'text-red-600'}`}
                  >
                    {r.ok ? '✓' : '✗'} {r.provider}
                    {r.error ? ` — ${r.error}` : ''}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Key groups */}
        {groups.map((group) => (
          <div key={group} className="mb-6">
            <div className="flex items-center gap-2 mb-2 px-1">
              <KeyRound className="w-3.5 h-3.5 text-gray-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {group}
              </h2>
            </div>
            <Card>
              <CardContent className="p-5 divide-y divide-gray-100">
                {providers
                  .filter((p) => p.group === group)
                  .map((p) => (
                    <ApiKeyField
                      key={p.id}
                      provider={p}
                      onSave={saveKey}
                      onTest={testKey}
                      onRemove={removeKey}
                    />
                  ))}
              </CardContent>
            </Card>
          </div>
        ))}

        {/* Preferences */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2 px-1">
            <Zap className="w-3.5 h-3.5 text-gray-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Preferences
            </h2>
          </div>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 text-sm">Transcription engine</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    Drives caption auto-sync and silence trimming. AssemblyAI gives the most
                    precise word timings; Whisper is free and needs no key.
                  </p>
                </div>
                <Select
                  value={settings.asr_provider || 'auto'}
                  onValueChange={(v) => settingsMutation.mutate({ asr_provider: v })}
                >
                  <SelectTrigger className="w-44 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="assemblyai" disabled={!hasAssembly}>
                      AssemblyAI{hasAssembly ? '' : ' (no key)'}
                    </SelectItem>
                    <SelectItem value="workers-ai">Whisper (free)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        <p className="text-[11px] text-gray-400 text-center leading-relaxed">
          Keys are encrypted with AES-GCM before being written to the database and are
          decrypted only inside the API worker for the duration of a request.
        </p>
      </div>
    </div>
  );
}
