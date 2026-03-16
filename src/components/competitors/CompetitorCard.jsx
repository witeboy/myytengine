import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, TrendingDown, Users, Eye, Video,
  DollarSign, Zap, BarChart3, ArrowUpRight
} from 'lucide-react';

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

const GRADE_COLORS = {
  'S-Tier': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'A-Tier': 'bg-green-100 text-green-800 border-green-300',
  'B-Tier': 'bg-blue-100 text-blue-800 border-blue-300',
  'C-Tier': 'bg-gray-100 text-gray-600 border-gray-300',
};

export default function CompetitorCard({ competitor, rank }) {
  const c = competitor;
  const isGrowing = c.growth_velocity > 0;

  return (
    <Card className="h-full">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <img
            src={c.thumbnail}
            alt={c.name}
            className="w-12 h-12 rounded-full object-cover border-2 border-gray-100"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-400">#{rank}</span>
              <h3 className="font-bold text-gray-900 text-sm truncate">{c.name}</h3>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={`text-[9px] border ${GRADE_COLORS[c.grade] || GRADE_COLORS['C-Tier']}`}>
                {c.grade}
              </Badge>
              <span className={`text-[10px] flex items-center gap-0.5 ${isGrowing ? 'text-green-600' : 'text-red-500'}`}>
                {isGrowing ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {Math.abs(c.growth_velocity).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <StatBox icon={Users} label="Subscribers" value={formatNum(c.subscribers)} />
          <StatBox icon={Eye} label="Avg Views/Day" value={formatNum(c.avg_views_per_day)} />
          <StatBox icon={BarChart3} label="Engagement" value={`${c.avg_engagement_pct}%`} />
          <StatBox icon={Zap} label="Viral Hits" value={c.viral_hits} accent />
          <StatBox icon={Video} label="Long-form" value={`${c.long_form_ratio}%`} />
          <StatBox icon={DollarSign} label="Est. Monthly" value={`$${formatNum(c.est_monthly_revenue)}`} accent />
        </div>

        {/* Monetization */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-gray-500">Monetization Confidence</span>
            <span className="font-medium text-gray-700">{Math.round(c.monetization_confidence * 100)}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-green-500 transition-all"
              style={{ width: `${c.monetization_confidence * 100}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {c.monetization_signals.map(s => (
              <Badge key={s} variant="outline" className="text-[8px] px-1 py-0">{s}</Badge>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">CPM: {c.cpm_category}</p>
        </div>

        {/* Recent Videos */}
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Recent Videos</p>
          <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
            {c.recent_videos.map((v, i) => (
              <div key={i} className="flex items-start gap-2 p-1.5 rounded bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-gray-800 truncate">{v.title}</p>
                  <div className="flex items-center gap-2 text-[9px] text-gray-400 mt-0.5">
                    <span>{formatNum(v.views)} views</span>
                    <span>·</span>
                    <span>{v.engagement_pct}% eng</span>
                    <span>·</span>
                    <span>{formatNum(v.vpd)}/day</span>
                    {v.is_long_form && <Badge className="text-[7px] px-1 py-0 bg-purple-100 text-purple-600">LONG</Badge>}
                  </div>
                </div>
                {v.opp_score > 1 && (
                  <ArrowUpRight className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatBox({ icon: Icon, label, value, accent }) {
  return (
    <div className="p-2 rounded-lg bg-gray-50 border border-gray-100">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className={`w-3 h-3 ${accent ? 'text-amber-500' : 'text-gray-400'}`} />
        <span className="text-[9px] text-gray-500">{label}</span>
      </div>
      <p className={`text-sm font-bold ${accent ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}