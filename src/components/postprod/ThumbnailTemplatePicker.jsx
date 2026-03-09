import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, CheckCircle2, ChevronRight, Zap, Brain, TrendingUp } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// THUMBNAIL TEMPLATE PICKER
// 1. Suggests 5 best templates for the script
// 2. User picks exactly 2
// 3. Calls onTemplatesSelected([id1, id2, id3])
// ══════════════════════════════════════════════════════════════════

const CTR_COLORS = {
  high:   { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  mid:    { bg: 'bg-blue-50',    border: 'border-blue-200',    badge: 'bg-blue-100 text-blue-700',       bar: 'bg-blue-500'    },
  low:    { bg: 'bg-slate-50',   border: 'border-slate-200',   badge: 'bg-slate-100 text-slate-600',     bar: 'bg-slate-400'   },
};

function getCtrTier(ctr) {
  const min = parseFloat((ctr || '').split('-')[0]) || 6;
  if (min >= 8) return 'high';
  if (min >= 7) return 'mid';
  return 'low';
}

function FitBar({ score }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-purple-400 to-purple-600 rounded-full transition-all duration-700"
          style={{ width: `${score || 0}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 font-medium w-8">{score}%</span>
    </div>
  );
}

function PowerDots({ power }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= power ? 'bg-amber-400' : 'bg-gray-200'}`} />
      ))}
    </div>
  );
}

function TemplateCard({ template, isSelected, selectionIndex, onToggle, disabled }) {
  const tier = getCtrTier(template.ctr_range);
  const colors = CTR_COLORS[tier];

  return (
    <div
      onClick={() => !disabled && onToggle(template)}
      className={`
        relative rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 select-none
        ${isSelected
          ? 'border-purple-500 bg-purple-50 shadow-md shadow-purple-100'
          : disabled
            ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
            : `${colors.border} ${colors.bg} hover:border-purple-300 hover:shadow-sm`
        }
      `}
    >
      {/* Selection badge */}
      {isSelected && (
        <div className="absolute -top-2.5 -right-2.5 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm">
          {selectionIndex}
        </div>
      )}

      {/* Rank badge */}
      <div className="absolute top-3 left-3">
        <span className="text-xs font-bold text-gray-400">#{template.rank}</span>
      </div>

      <div className="pt-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{template.icon}</span>
            <div>
              <p className="font-semibold text-sm leading-tight text-gray-900">{template.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge className={`text-[10px] px-1.5 py-0 ${colors.badge}`}>
                  {template.ctr_range} CTR
                </Badge>
                <PowerDots power={template.power} />
              </div>
            </div>
          </div>
          {isSelected
            ? <CheckCircle2 className="w-5 h-5 text-purple-600 shrink-0" />
            : <div className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0" />
          }
        </div>

        {/* Script-specific example text */}
        <div className="bg-black/5 rounded-lg px-3 py-2 mb-3">
          <p className="text-xs text-gray-500 mb-0.5 font-medium">Example text for your video:</p>
          <p className="font-black text-sm text-gray-900 tracking-wide">{template.example_text_for_this_video}</p>
        </div>

        {/* Why it fits */}
        <p className="text-xs text-gray-600 leading-relaxed mb-3">{template.why_it_fits}</p>

        {/* Psychology */}
        <div className="flex items-start gap-1.5 mb-3">
          <Brain className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-purple-700 italic">{template.psychology}</p>
        </div>

        {/* Fit score bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Script fit</span>
          </div>
          <FitBar score={template.fit_score} />
        </div>

        {/* Face required indicator */}
        {template.face_required && (
          <div className="mt-2 flex items-center gap-1">
            <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">👤 Face expression required</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ThumbnailTemplatePicker({ projectId, onTemplatesSelected }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [selected, setSelected] = useState([]); // array of template objects, max 3

  const handleSuggest = async () => {
    setLoading(true);
    setError(null);
    setSelected([]);
    try {
      const res = await base44.functions.invoke('suggestThumbnailTemplates', { project_id: projectId });
      if (res.data?.error) throw new Error(res.data.error);
      setSuggestions(res.data);
    } catch (e) {
      setError(e.message || 'Failed to get suggestions');
    }
    setLoading(false);
  };

  const handleToggle = (template) => {
    setSelected(prev => {
      const exists = prev.find(s => s.template_id === template.template_id);
      if (exists) return prev.filter(s => s.template_id !== template.template_id);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, template];
    });
  };

  const handleConfirm = () => {
    if (selected.length !== 3) return;
    onTemplatesSelected(selected.map(s => s.template_id));
  };

  const isMaxed = selected.length >= 3;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Template Intelligence
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            AI analyzes your script and recommends the 5 highest-CTR templates
          </p>
        </div>
        <Button
          onClick={handleSuggest}
          disabled={loading}
          variant={suggestions ? 'outline' : 'default'}
          size="sm"
          className="gap-2 shrink-0"
        >
          {loading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing…</>
            : suggestions
              ? <><Sparkles className="w-3.5 h-3.5" /> Re-analyze</>
              : <><Sparkles className="w-3.5 h-3.5" /> Suggest Templates</>
          }
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Loading shimmer */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="rounded-xl border-2 border-gray-100 p-4 animate-pulse">
              <div className="h-4 bg-gray-100 rounded mb-3 w-1/2" />
              <div className="h-3 bg-gray-100 rounded mb-2 w-full" />
              <div className="h-3 bg-gray-100 rounded mb-2 w-3/4" />
              <div className="h-2 bg-gray-100 rounded w-full mt-4" />
            </div>
          ))}
        </div>
      )}

      {/* Video analysis summary */}
      {suggestions?.video_analysis && !loading && (
        <div className="bg-gradient-to-r from-slate-50 to-purple-50 border border-purple-100 rounded-lg px-4 py-3 flex flex-wrap gap-4">
          <div className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs text-gray-600"><span className="font-medium">Core emotion:</span> {suggestions.video_analysis.core_emotion}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs text-gray-600"><span className="font-medium">Strongest hook:</span> {suggestions.video_analysis.strongest_hook}</span>
          </div>
        </div>
      )}

      {/* Template cards */}
      {suggestions?.top_5 && !loading && (
        <>
          {/* Selection counter */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">
              Pick exactly <span className="text-purple-700 font-bold">2 templates</span> to generate
              <span className="ml-2 text-gray-400 font-normal">({selected.length}/3 selected)</span>
            </p>
            {selected.length === 3 && (
              <div className="flex gap-1">
                {selected.map((s, i) => (
                  <Badge key={s.template_id} className="text-[10px] bg-purple-100 text-purple-700">
                    {i+1}. {s.icon} {s.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {suggestions.top_5.map(template => {
              const idx = selected.findIndex(s => s.template_id === template.template_id);
              const isSelected = idx !== -1;
              const isDisabled = isMaxed && !isSelected;
              return (
                <TemplateCard
                  key={template.template_id}
                  template={template}
                  isSelected={isSelected}
                  selectionIndex={isSelected ? idx + 1 : null}
                  onToggle={handleToggle}
                  disabled={isDisabled}
                />
              );
            })}
          </div>

          {/* Confirm button */}
          {selected.length > 0 && (
            <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
              <div>
                {selected.length < 3
                  ? <p className="text-sm text-purple-700">Select <span className="font-bold">{3 - selected.length} more</span> template{3 - selected.length > 1 ? 's' : ''} to continue</p>
                  : <div>
                      <p className="text-sm font-semibold text-purple-900">2 templates locked in ✓</p>
                      <p className="text-xs text-purple-600">One concept will be generated per template</p>
                    </div>
                }
              </div>
              <Button
                onClick={handleConfirm}
                disabled={selected.length !== 3}
                className="gap-2 bg-purple-600 hover:bg-purple-700"
              >
                Generate 3 Concepts <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!suggestions && !loading && !error && (
        <Card className="border-dashed border-2 border-gray-200">
          <CardContent className="py-8 text-center">
            <Zap className="w-10 h-10 text-amber-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-1">Let AI pick the best templates for your script</p>
            <p className="text-xs text-gray-400">Analyzes your script's emotion, hooks, and content type</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
