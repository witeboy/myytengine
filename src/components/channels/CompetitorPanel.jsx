import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users, Loader2, RefreshCw, TrendingUp, TrendingDown,
  Eye, Zap, DollarSign, ChevronDown, ChevronUp,
  Shield, Lightbulb, BarChart3, Video, Trophy, Sparkles
} from 'lucide-react';
import CompetitorVideoList from './CompetitorVideoList';
import RepurposeVideoDialog from './RepurposeVideoDialog';

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

const GRADE_COLORS = {
  'S-Tier': 'bg-yellow-100 text-yellow-800',
  'A-Tier': 'bg-green-100 text-green-800',
  'B-Tier': 'bg-blue-100 text-blue-800',
  'C-Tier': 'bg-gray-100 text-gray-600',
};

const THREAT_COLORS = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};

export default function CompetitorPanel({ channel, onTopicsChanged }) {
  const [loading, setLoading] = useState(false);
  const [competitors, setCompetitors] = useState([]);
  const [aiSummary, setAiSummary] = useState(null);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [showStrategy, setShowStrategy] = useState(false);
  const [repurposeVideo, setRepurposeVideo] = useState(null);
  const [repurposeCompetitor, setRepurposeCompetitor] = useState(null);

  // Load cached data from channel.ai_insights
  useEffect(() => {
    if (channel?.ai_insights) {
      try {
        const insights = JSON.parse(channel.ai_insights);
        if (insights.competitor_data) {
          setCompetitors(insights.competitor_data.competitors || []);
          setAiSummary(insights.competitor_data.ai_summary || null);
          setRefreshedAt(insights.competitor_data.refreshed_at);
        }
      } catch (_) {}
    }
  }, [channel?.ai_insights]);

  const handleRefresh = async () => {
    setLoading(true);
    const res = await base44.functions.invoke('discoverCompetitors', { channel_id: channel.id });
    setLoading(false);
    if (res.data?.success && res.data.competitors) {
      setCompetitors(res.data.competitors);
      setAiSummary(res.data.ai_summary || null);
      setRefreshedAt(new Date().toISOString());
    }
  };

  const color = channel?.color || '#3B82F6';

  // Empty / initial state
  if (competitors.length === 0 && !loading) {
    return (
      <Card className="border-2 border-dashed border-gray-200">
        <CardContent className="p-5 text-center">
          <Users className="w-8 h-8 mx-auto mb-2 text-red-400" />
          <h3 className="font-bold text-gray-700 mb-1">Competitor Monitor</h3>
          <p className="text-xs text-gray-500 mb-4 max-w-md mx-auto">
            Auto-discover and analyze top competitors in your niche. See their strategies, best videos, and monetization signals.
          </p>
          <Button onClick={handleRefresh} disabled={loading} className="bg-red-600 hover:bg-red-700">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Users className="w-4 h-4 mr-1" />}
            Scan Competitors
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-red-500">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-bold text-gray-800">Competitor Monitor</h3>
            <Badge className="text-[9px] bg-red-50 text-red-600">{competitors.length} tracked</Badge>
            {refreshedAt && (
              <span className="text-[9px] text-gray-400">
                Updated {new Date(refreshedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading} className="h-7 text-xs">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </Button>
        </div>

        {loading && (
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-red-400" />
            <p className="text-xs text-gray-500">Scanning YouTube for competitors...</p>
          </div>
        )}

        {!loading && (
          <>
            {/* AI Strategy Summary */}
            {aiSummary && (
              <div className="mb-3">
                <button
                  onClick={() => setShowStrategy(!showStrategy)}
                  className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 text-left hover:from-red-100 hover:to-orange-100 transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-gray-800">AI Competitive Intelligence</span>
                    {aiSummary.biggest_threat && (
                      <p className="text-[10px] text-gray-500 truncate mt-0.5">⚠️ {aiSummary.biggest_threat}</p>
                    )}
                  </div>
                  <Badge className={`text-[9px] flex-shrink-0 ${THREAT_COLORS[aiSummary.threat_level] || THREAT_COLORS.medium}`}>
                    <Shield className="w-2.5 h-2.5 mr-0.5" /> {aiSummary.threat_level}
                  </Badge>
                  {showStrategy ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                </button>

                {showStrategy && (
                  <div className="mt-2 space-y-2.5 pl-2">
                    {aiSummary.fastest_growing && (
                      <div className="flex items-center gap-2 text-xs">
                        <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-gray-500">Fastest Growing:</span>
                        <span className="font-medium text-gray-800">{aiSummary.fastest_growing}</span>
                      </div>
                    )}

                    {aiSummary.content_strategies?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 mb-1">Their Strategies</p>
                        {aiSummary.content_strategies.map((s, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[11px] text-gray-700 mb-1">
                            <span className="text-red-400">→</span> {s}
                          </div>
                        ))}
                      </div>
                    )}

                    {aiSummary.topics_they_cover?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 mb-1">Hot Topics They Cover</p>
                        <div className="flex flex-wrap gap-1">
                          {aiSummary.topics_they_cover.map((t, i) => (
                            <Badge key={i} variant="outline" className="text-[9px]">{t}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {aiSummary.gaps_we_can_exploit?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 mb-1">Gaps We Can Exploit</p>
                        {aiSummary.gaps_we_can_exploit.map((g, i) => (
                          <div key={i} className="flex items-start gap-1.5 p-1.5 rounded bg-green-50 border border-green-100 mb-1">
                            <Lightbulb className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                            <span className="text-[11px] text-gray-700">{g}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {aiSummary.thumbnail_patterns && (
                      <div className="text-[11px]">
                        <span className="text-gray-500 font-medium">Thumbnail Style:</span>{' '}
                        <span className="text-gray-700">{aiSummary.thumbnail_patterns}</span>
                      </div>
                    )}
                    {aiSummary.posting_frequency && (
                      <div className="text-[11px]">
                        <span className="text-gray-500 font-medium">Posting Pattern:</span>{' '}
                        <span className="text-gray-700">{aiSummary.posting_frequency}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Competitor Cards */}
            <div className="space-y-2">
              {competitors.map((c, idx) => {
                const isExpanded = expandedId === c.channel_id;
                const isGrowing = c.growth_velocity > 0;

                return (
                  <div key={c.channel_id} className="border border-gray-100 rounded-lg overflow-hidden">
                    {/* Collapsed row */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : c.channel_id)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <img src={c.thumbnail} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-900 truncate">{c.name}</span>
                          <Badge className={`text-[8px] ${GRADE_COLORS[c.grade]}`}>{c.grade}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-0.5">
                          <span>{formatNum(c.subscribers)} subs</span>
                          <span>{formatNum(c.avg_views_per_day)} views/day</span>
                          <span>{c.avg_engagement_pct}% eng</span>
                          <span className={`flex items-center gap-0.5 ${isGrowing ? 'text-green-500' : 'text-red-400'}`}>
                            {isGrowing ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                            {Math.abs(c.growth_velocity).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-amber-700">${formatNum(c.est_monthly_revenue)}/mo</p>
                        <p className="text-[9px] text-gray-400">{c.viral_hits} viral</p>
                      </div>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-300" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-300" />}
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 p-3 bg-gray-50/50 space-y-3">
                        {/* Stats row */}
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          <MiniStat icon={Users} label="Subs" value={formatNum(c.subscribers)} />
                          <MiniStat icon={Eye} label="Views/Day" value={formatNum(c.avg_views_per_day)} />
                          <MiniStat icon={BarChart3} label="Engagement" value={`${c.avg_engagement_pct}%`} />
                          <MiniStat icon={Video} label="Long-form" value={`${c.long_form_ratio}%`} />
                          <MiniStat icon={Zap} label="Viral Hits" value={c.viral_hits} />
                          <MiniStat icon={DollarSign} label="Mon. Conf." value={`${Math.round(c.monetization_confidence * 100)}%`} />
                        </div>

                        {/* Monetization */}
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                          <span className="text-gray-500">Signals:</span>
                          {c.monetization_signals.map(s => (
                            <Badge key={s} variant="outline" className="text-[8px] px-1 py-0">{s}</Badge>
                          ))}
                          <span className="text-gray-400 ml-1">CPM: {c.cpm_category}</span>
                        </div>

                        {/* Top Performing Videos */}
                        {c.top_performing?.length > 0 && (
                          <CompetitorVideoList videos={c.top_performing} title="🏆 Top Performing Videos" />
                        )}

                        {/* Viral / Overperforming */}
                        {c.viral_videos?.length > 0 && (
                          <CompetitorVideoList videos={c.viral_videos} title="🔥 Viral / Overperforming" />
                        )}

                        {/* Recent Videos */}
                        <CompetitorVideoList
                          videos={c.recent_videos?.slice(0, 5)}
                          title="📅 Most Recent"
                          emptyText="No recent videos"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div className="text-center p-1.5 rounded bg-white border border-gray-100">
      <Icon className="w-3 h-3 text-gray-400 mx-auto mb-0.5" />
      <p className="text-xs font-bold text-gray-900">{value}</p>
      <p className="text-[8px] text-gray-400">{label}</p>
    </div>
  );
}