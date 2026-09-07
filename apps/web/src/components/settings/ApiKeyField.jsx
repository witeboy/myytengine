import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Eye, EyeOff, Check, X, Loader2, Trash2, ExternalLink, AlertCircle,
} from 'lucide-react';

const TIER = {
  core: { label: 'Required', className: 'bg-red-50 text-red-700 border-red-200' },
  recommended: { label: 'Recommended', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  optional: { label: 'Optional', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export default function ApiKeyField({ provider, onSave, onTest, onRemove }) {
  const [value, setValue] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(null); // 'save' | 'test' | 'remove'
  const [result, setResult] = useState(null); // { ok, error }

  const tier = TIER[provider.tier] || TIER.optional;
  const dirty = value.trim().length > 0;

  const run = async (kind, fn) => {
    setBusy(kind);
    setResult(null);
    try {
      const res = await fn();
      if (kind === 'test') setResult(res);
      if (kind === 'save') { setResult({ ok: true }); setValue(''); }
    } catch (err) {
      setResult({ ok: false, error: err.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 text-sm">{provider.label}</span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${tier.className}`}>
              {tier.label}
            </Badge>
            {provider.configured && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                <Check className="w-3 h-3" /> {provider.hint}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{provider.help}</p>
        </div>
        <a
          href={provider.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs text-gray-400 hover:text-blue-600 inline-flex items-center gap-1"
        >
          Get key <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type={provider.secret && !reveal ? 'password' : 'text'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={provider.configured ? 'Enter a new value to replace' : provider.placeholder}
            autoComplete="off"
            spellCheck={false}
            className="pr-9 font-mono text-xs"
          />
          {provider.secret && (
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={reveal ? 'Hide value' : 'Show value'}
            >
              {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>

        <Button
          size="sm"
          disabled={!dirty || busy !== null}
          onClick={() => run('save', () => onSave(provider.id, value.trim()))}
        >
          {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
        </Button>

        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null || (!dirty && !provider.configured)}
          onClick={() => run('test', () => onTest(provider.id, dirty ? value.trim() : undefined))}
        >
          {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Test'}
        </Button>

        {provider.configured && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy !== null}
            onClick={() => run('remove', () => onRemove(provider.id))}
            aria-label={`Remove ${provider.label} key`}
          >
            {busy === 'remove'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Trash2 className="w-3.5 h-3.5 text-gray-400" />}
          </Button>
        )}
      </div>

      {result && (
        <p
          className={`mt-2 text-xs flex items-start gap-1.5 ${
            result.ok ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {result.ok ? <Check className="w-3.5 h-3.5 mt-px shrink-0" /> : <X className="w-3.5 h-3.5 mt-px shrink-0" />}
          <span>{result.ok ? 'Key accepted.' : result.error}</span>
        </p>
      )}

      {!result && provider.last_error && (
        <p className="mt-2 text-xs text-amber-600 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" />
          <span>Last check failed: {provider.last_error}</span>
        </p>
      )}
    </div>
  );
}
