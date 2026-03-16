import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  TrendingUp, Lightbulb, HelpCircle, Rocket, RefreshCw,
  Loader2, Clock, Eye, ChevronDown, ChevronUp, Sparkles
} from 'lucide-react';

export default function NicheInsightsPanel({ channel, onRefreshed }) {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  let insights = null;
  if (channel?.ai_insights) {
    try { insights = JSON.parse(channel.ai_insights); } catch (_) {}
  }

  const handleRefresh = async () => {
    setLoading(true);
    await base44.functions.invoke('fetchNicheTrends', { channel_id: channel.id });
    setLoading(false);
    onRefreshed?.();
  };

  const toggle = (section) => setExpanded(expanded === section ? null : section);

  const color = channel?.color || '#3B82F6';

  if (!insights) {
    return (
      <Card className="border-dashed border-2 border-gray-200">
        <CardContent className="p-5 text-center">
          <Sparkles className="w-8 h-8 mx-auto mb-2 text-purple-400" />
          <h3 className="font-bold text-gray-700 mb-1">AI Intelligence</h3>
          <p className="text-xs text-gray-500 mb-4">
            Get YouTube trend analysis, topic suggestions, and strategic recommendations for your niche
          </p>
          <Button onClick={handleRefresh} disabled={loading} className="bg-purple-600 hover:bg-purple-700">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
            Analyze Niche Trends
          </Button>
        </CardContent>
      </Card>
    );
  }

  const sections = [
    {
      key: 'trending',
      title: 'Trending Themes',
      icon: TrendingUp,
      iconColor: '#EF4444',
      content: insights.trending_themes?.map((t, i) => (
        <div key={i} className="p-2.5 rounded-lg bg-red-50/50 border border-red-100 mb-2">
          <p className="text-sm font-medium text-gray-800">{t.theme}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{t.why_hot}</p>
          {t.opportunity && <p className="text-[11px] text-green-600 mt-0.5">💡 {t.opportunity}</p>}
        </div>
      ))
    },
    {
      key: 'gaps',
      title: 'Content Gaps',
      icon: Lightbulb,
      iconColor: '#F59E0B',
      content: insights.content_gaps?.map((g, i) => (
        <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50/50 border border-amber-100 mb-2">
          <Badge className={`text-[9px] flex-shrink-0 mt-0.5 ${g.format === 'short' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
            {g.format === 'short' ? 'S' : 'L'}
          </Badge>
          <div>
            <p className="text-sm font-medium text-gray-800">{g.title}</p>
            <p className="text-[11px] text-gray-500">{g.reason}</p>
          </div>
        </div>
      ))
    },
    {
      key: 'topics',
      title: 'Suggested Topics',
      icon: Rocket,
      iconColor: '#8B5CF6',
      content: insights.suggested_topics?.map((t, i) => (
        <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-purple-50/50 border border-purple-100 mb-2">
          <Badge className={`text-[9px] flex-shrink-0 mt-0.5 ${t.format === 'short' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
            {t.format === 'short' ? 'S' : 'L'}
          </Badge>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800">{t.title}</p>
            <p className="text-[11px] text-gray-500">{t.rationale}</p>
            {t.trend_score && (
              <div className="flex items-center gap-1 mt-1">
                <div className="h-1 w-16 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: `${t.trend_score}%` }} />
                </div>
                <span className="text-[9px] text-gray-400">{t.trend_score}% trend</span>
              </div>
            )}
          </div>
        </div>
      ))
    },
    {
      key: 'questions',
      title: 'Audience Questions',
      icon: HelpCircle,
      iconColor: '#06B6D4',
      content: insights.audience_questions?.map((q, i) => (
        <div key={i} className="p-2.5 rounded-lg bg-cyan-50/50 border border-cyan-100 mb-2">
          <p className="text-sm text-gray-800">❓ {q}</p>
        </div>
      ))
    },
  ];

  return (
    <Card className="border-l-4" style={{ borderLeftColor: color }}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color }} />
            <h3 className="text-sm font-bold text-gray-800">AI Intelligence</h3>
            {insights.refreshed_at && (
              <span className="text-[9px] text-gray-400">
                Updated {new Date(insights.refreshed_at).toLocaleDateString()}
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading} className="h-7 text-xs">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </Button>
        </div>

        {/* Posting Strategy Summary */}
        {insights.posting_strategy && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-xs font-semibold text-blue-800">Best Posting Times</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-gray-500">Shorts:</span>{' '}
                <span className="text-gray-800 font-medium">
                  {insights.posting_strategy.best_short_times?.join(', ') || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Long-form:</span>{' '}
                <span className="text-gray-800 font-medium">
                  {insights.posting_strategy.best_long_times?.join(', ') || 'N/A'}
                </span>
              </div>
            </div>
            {insights.posting_strategy.reasoning && (
              <p className="text-[10px] text-gray-500 mt-1.5">{insights.posting_strategy.reasoning}</p>
            )}
          </div>
        )}

        {/* Growth Tips */}
        {insights.growth_tips && (
          <div className="mb-3 space-y-1.5">
            {insights.growth_tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <Badge className={`text-[9px] flex-shrink-0 ${tip.impact === 'high' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {tip.impact}
                </Badge>
                <span className="text-gray-700">{tip.tip}</span>
              </div>
            ))}
          </div>
        )}

        {/* Expandable Sections */}
        <div className="space-y-1.5">
          {sections.map(section => (
            <div key={section.key}>
              <button
                onClick={() => toggle(section.key)}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
              >
                <section.icon className="w-3.5 h-3.5" style={{ color: section.iconColor }} />
                <span className="text-xs font-medium text-gray-700 flex-1">{section.title}</span>
                {expanded === section.key ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
              </button>
              {expanded === section.key && (
                <div className="pl-6 pb-2">
                  {section.content}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Competition Insight */}
        {insights.competition_insight && (
          <div className="mt-3 p-2.5 bg-gray-50 rounded-lg">
            <p className="text-[11px] text-gray-500">
              <Eye className="w-3 h-3 inline mr-1" />
              <span className="font-medium text-gray-700">Competition:</span> {insights.competition_insight}
            </p>
          </div>
        )}

        {/* Trending Videos */}
        {insights.trending_videos?.length > 0 && (
          <div className="mt-3">
            <button onClick={() => toggle('videos')} className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-gray-600">
              <TrendingUp className="w-3 h-3" />
              {insights.trending_videos.length} Trending Videos
              {expanded === 'videos' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {expanded === 'videos' && (
              <div className="mt-2 space-y-1.5">
                {insights.trending_videos.slice(0, 8).map((v, i) => (
                  <div key={i} className="text-[11px] p-2 bg-gray-50 rounded">
                    <p className="text-gray-800 truncate">{v.title}</p>
                    <p className="text-gray-400">{formatViews(v.views)} views · {v.channelTitle}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatViews(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}