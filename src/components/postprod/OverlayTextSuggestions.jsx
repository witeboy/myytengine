// ══════════════════════════════════════════════════════════════════
// OverlayTextSuggestions.jsx
// AI-Generated Overlay Text Suggestions for Each Template
// ══════════════════════════════════════════════════════════════════
// Place in: src/components/postprod/OverlayTextSuggestions.jsx
// ══════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles, Copy, Check, RefreshCw, Loader2, Star, ChevronDown, 
  ChevronUp, Zap, Target, Brain, TrendingUp, AlertCircle
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// TEMPLATE METADATA (for display)
// ══════════════════════════════════════════════════════════════════

const TEMPLATE_INFO = {
  shock_side: { icon: '💥', name: 'Shock Side', color: 'bg-purple-100 text-purple-700' },
  centered_massive: { icon: '🎯', name: 'Centered Massive', color: 'bg-blue-100 text-blue-700' },
  stacked_youtube: { icon: '📺', name: 'YouTube Stacked', color: 'bg-red-100 text-red-700' },
  split_before_after: { icon: '↔️', name: 'Before/After', color: 'bg-green-100 text-green-700' },
  income_reveal: { icon: '💰', name: 'Income Reveal', color: 'bg-emerald-100 text-emerald-700' },
  warning_alert: { icon: '⚠️', name: 'Warning Alert', color: 'bg-red-100 text-red-700' },
  question_hook: { icon: '❓', name: 'Question Hook', color: 'bg-cyan-100 text-cyan-700' },
  metric_cards: { icon: '📊', name: 'Metric Cards', color: 'bg-indigo-100 text-indigo-700' },
  data_explosion: { icon: '📈', name: 'Data Explosion', color: 'bg-orange-100 text-orange-700' },
  minimal_corner: { icon: '📌', name: 'Minimal Corner', color: 'bg-gray-100 text-gray-700' }
};

// ══════════════════════════════════════════════════════════════════
// SINGLE SUGGESTION CARD
// ══════════════════════════════════════════════════════════════════

function SuggestionCard({ suggestion, templateId, onCopy }) {
  const [copied, setCopied] = useState(false);

  // Build display text based on template layers
  const getDisplayText = () => {
    const parts = [];
    
    if (suggestion.headline) parts.push(suggestion.headline);
    if (suggestion.subtext) parts.push(suggestion.subtext);
    if (suggestion.before_label) parts.push(`${suggestion.before_label} → ${suggestion.after_label}`);
    if (suggestion.amount) parts.push(`${suggestion.amount} ${suggestion.timeframe || ''}`);
    if (suggestion.warning) parts.push(`${suggestion.warning} ${suggestion.consequence || ''}`);
    if (suggestion.question) parts.push(suggestion.question);
    if (suggestion.main_stat) parts.push(suggestion.main_stat);
    if (suggestion.text) parts.push(suggestion.text);
    
    return parts.join(' | ') || 'No text';
  };

  // Build copyable object
  const getCopyData = () => {
    const data = { ...suggestion };
    delete data.ctr_score;
    delete data.psychology;
    return data;
  };

  const handleCopy = () => {
    const copyData = getCopyData();
    const copyText = Object.entries(copyData)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    
    navigator.clipboard.writeText(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    
    if (onCopy) onCopy(copyData);
  };

  const ctrScore = suggestion.ctr_score || 7;
  
  return (
    <div className="group bg-white border rounded-lg p-3 hover:border-purple-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Main Text Display */}
          <p className="font-bold text-gray-900 text-sm leading-tight mb-1.5">
            {getDisplayText()}
          </p>
          
          {/* Psychology Reason */}
          {suggestion.psychology && (
            <p className="text-xs text-gray-500 line-clamp-2">
              <Brain className="w-3 h-3 inline mr-1 text-purple-400" />
              {suggestion.psychology}
            </p>
          )}
        </div>

        {/* CTR Score + Copy */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
            ctrScore >= 9 ? 'bg-green-100 text-green-700' :
            ctrScore >= 8 ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            <Star className="w-3 h-3" />
            {ctrScore}/10
          </div>
          
          <Button
            size="sm"
            variant="ghost"
            className={`h-7 px-2 text-xs ${copied ? 'text-green-600' : 'text-gray-500'}`}
            onClick={handleCopy}
          >
            {copied ? (
              <><Check className="w-3 h-3 mr-1" /> Copied</>
            ) : (
              <><Copy className="w-3 h-3 mr-1" /> Copy</>
            )}
          </Button>
        </div>
      </div>

      {/* Layer breakdown for multi-layer templates */}
      {(suggestion.metric1 || suggestion.stat1 || suggestion.badge) && (
        <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1.5">
          {suggestion.badge && (
            <Badge variant="outline" className="text-[10px] bg-red-50">{suggestion.badge}</Badge>
          )}
          {suggestion.metric1 && (
            <Badge variant="outline" className="text-[10px] bg-green-50">{suggestion.metric1}</Badge>
          )}
          {suggestion.metric2 && (
            <Badge variant="outline" className="text-[10px] bg-green-50">{suggestion.metric2}</Badge>
          )}
          {suggestion.stat1 && (
            <Badge variant="outline" className="text-[10px] bg-blue-50">{suggestion.stat1}</Badge>
          )}
          {suggestion.stat2 && (
            <Badge variant="outline" className="text-[10px] bg-blue-50">{suggestion.stat2}</Badge>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TEMPLATE SECTION (Collapsible)
// ══════════════════════════════════════════════════════════════════

function TemplateSection({ templateId, suggestions, onCopy, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const info = TEMPLATE_INFO[templateId] || { icon: '📝', name: templateId, color: 'bg-gray-100 text-gray-700' };

  if (!suggestions || suggestions.length === 0) return null;

  // Find best suggestion
  const bestScore = Math.max(...suggestions.map(s => s.ctr_score || 0));

  return (
    <div className="border rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{info.icon}</span>
          <div className="text-left">
            <p className="font-semibold text-gray-900 text-sm">{info.name}</p>
            <p className="text-xs text-gray-500">{suggestions.length} suggestions</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {bestScore >= 9 && (
            <Badge className="bg-green-100 text-green-700 text-[10px]">
              <Zap className="w-2.5 h-2.5 mr-0.5" /> High CTR
            </Badge>
          )}
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Suggestions */}
      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {suggestions.map((suggestion, idx) => (
            <SuggestionCard
              key={idx}
              suggestion={suggestion}
              templateId={templateId}
              onCopy={onCopy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════

export default function OverlayTextSuggestions({ 
  projectId, 
  videoTitle,
  scriptExcerpt,
  niche,
  onSuggestionSelect,
  className = ''
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [error, setError] = useState(null);
  const [bestOverall, setBestOverall] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [expandedCount, setExpandedCount] = useState(3);

  // Generate suggestions
  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await base44.functions.invoke('generateOverlayTextSuggestions', {
        project_id: projectId,
        video_title: videoTitle,
        script_excerpt: scriptExcerpt,
        niche: niche
      });

      const data = res.data;

      if (data.error) {
        setError(data.error);
      } else {
        setSuggestions(data.suggestions);
        setBestOverall(data.best_overall);
        setAnalysis(data.title_analysis);
      }
    } catch (e) {
      setError(e.message || 'Failed to generate suggestions');
    }

    setLoading(false);
  };

  // Handle copy/select
  const handleCopy = (templateId, suggestionData) => {
    if (onSuggestionSelect) {
      onSuggestionSelect({
        templateId,
        ...suggestionData
      });
    }
  };

  // Template order (by importance/CTR potential)
  const templateOrder = [
    'shock_side', 'income_reveal', 'warning_alert', 'stacked_youtube',
    'split_before_after', 'question_hook', 'data_explosion', 'metric_cards',
    'centered_massive', 'minimal_corner'
  ];

  return (
    <div className={className}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">Overlay Text Generator</CardTitle>
                <p className="text-xs text-gray-500">AI-powered CTR-optimized suggestions</p>
              </div>
            </div>
            
            <Button
              onClick={handleGenerate}
              disabled={loading}
              className="gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
              ) : suggestions ? (
                <><RefreshCw className="w-4 h-4" /> Regenerate</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Generate Suggestions</>
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-700 text-sm">Generation Failed</p>
                <p className="text-xs text-red-600 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!suggestions && !loading && !error && (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-purple-400" />
              </div>
              <p className="text-gray-600 font-medium mb-2">No suggestions yet</p>
              <p className="text-sm text-gray-400 mb-4">
                Click "Generate Suggestions" to get AI-powered overlay text ideas
              </p>
              <p className="text-xs text-gray-400">
                Works best when you have a video title and script
              </p>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 text-purple-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Analyzing your content...</p>
              <p className="text-sm text-gray-400 mt-1">
                Generating CTR-optimized text for each template
              </p>
            </div>
          )}

          {/* Results */}
          {suggestions && !loading && (
            <>
              {/* Analysis Banner */}
              {analysis && (
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-100">
                  <div className="flex items-start gap-4">
                    <Target className="w-8 h-8 text-purple-500 shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">Content Analysis</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge className="bg-purple-100 text-purple-700 text-xs">
                          {analysis.primary_emotion} emotion
                        </Badge>
                        <Badge className="bg-pink-100 text-pink-700 text-xs">
                          {analysis.hook_type} hook
                        </Badge>
                        <Badge className="bg-blue-100 text-blue-700 text-xs">
                          Target: {analysis.target_audience}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Best Overall Recommendation */}
              {bestOverall && (
                <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
                      <TrendingUp className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-green-800">
                        Best Template: {TEMPLATE_INFO[bestOverall.template_id]?.name || bestOverall.template_id}
                      </p>
                      <p className="text-sm text-green-700 mt-0.5">{bestOverall.reason}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Template Sections */}
              <div className="space-y-3">
                {templateOrder.map((templateId, idx) => (
                  <TemplateSection
                    key={templateId}
                    templateId={templateId}
                    suggestions={suggestions[templateId]}
                    onCopy={(data) => handleCopy(templateId, data)}
                    defaultExpanded={idx < expandedCount}
                  />
                ))}
              </div>

              {/* Show More/Less */}
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpandedCount(expandedCount >= 10 ? 3 : 10)}
                  className="text-xs"
                >
                  {expandedCount >= 10 ? 'Collapse All' : 'Expand All Templates'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
