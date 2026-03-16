import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Copy, CheckCircle2, Zap, TrendingUp, Search, Star, Target, Eye, Flame
} from 'lucide-react';

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost" size="icon"
      className="h-7 w-7"
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
    </Button>
  );
}

const HOOK_COLORS = {
  curiosity_gap: 'bg-purple-100 text-purple-800',
  power_word: 'bg-red-100 text-red-800',
  number: 'bg-blue-100 text-blue-800',
  warning: 'bg-orange-100 text-orange-800',
  pattern_break: 'bg-pink-100 text-pink-800',
};

const TRIGGER_COLORS = {
  fear: 'text-red-600',
  greed: 'text-green-600',
  shock: 'text-amber-600',
  curiosity: 'text-purple-600',
  envy: 'text-emerald-600',
  urgency: 'text-orange-600',
};

function ScoreBar({ score, max = 10, color = 'bg-blue-500' }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-500 font-semibold w-5 text-right">{score}</span>
    </div>
  );
}

export default function SeoTitlesPanel({ titles, seoAnalysis, selectedTitles = [], onToggleTitle }) {
  if (!titles || titles.length === 0) return null;

  const isSelected = (t) => selectedTitles.some(s => s.rank === (t.rank || 0));

  return (
    <div className="space-y-4">
      {/* SEO Analysis Card */}
      {seoAnalysis && (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-900">Keyword & SEO Intelligence</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="bg-white/70 rounded-lg p-2.5">
                <span className="text-gray-500 block mb-0.5">Primary Keyword</span>
                <span className="font-bold text-blue-900">{seoAnalysis.primary_keyword}</span>
              </div>
              <div className="bg-white/70 rounded-lg p-2.5">
                <span className="text-gray-500 block mb-0.5">Search Volume</span>
                <span className="font-bold">{seoAnalysis.estimated_search_volume}</span>
              </div>
              <div className="bg-white/70 rounded-lg p-2.5">
                <span className="text-gray-500 block mb-0.5">Competition</span>
                <Badge className={`text-[10px] ${
                  seoAnalysis.competition === 'low' ? 'bg-green-100 text-green-800' :
                  seoAnalysis.competition === 'medium' ? 'bg-amber-100 text-amber-800' :
                  'bg-red-100 text-red-800'
                }`}>{seoAnalysis.competition}</Badge>
              </div>
              <div className="bg-white/70 rounded-lg p-2.5">
                <span className="text-gray-500 block mb-0.5">Best Upload</span>
                <span className="font-bold">{seoAnalysis.recommended_upload_day} {seoAnalysis.recommended_upload_time}</span>
              </div>
            </div>
            {seoAnalysis.secondary_keywords?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                <span className="text-[10px] text-gray-500 mr-1 self-center">Secondary:</span>
                {seoAnalysis.secondary_keywords.map((kw, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] bg-white/50">{kw}</Badge>
                ))}
              </div>
            )}
            {seoAnalysis.trending_angle && (
              <p className="text-xs text-blue-800 mt-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> {seoAnalysis.trending_angle}
              </p>
            )}
            {seoAnalysis.niche_opportunity && (
              <p className="text-xs text-indigo-700 mt-1 flex items-center gap-1">
                <Target className="w-3 h-3" /> {seoAnalysis.niche_opportunity}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Titles Grid */}
      <div className="space-y-2">
        {titles.map((t, idx) => {
          const triggerColor = TRIGGER_COLORS[(t.clickbait_trigger || '').toLowerCase()] || 'text-gray-600';
          return (
            <div
              key={idx}
              onClick={() => onToggleTitle?.(t)}
              className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                isSelected(t)
                  ? 'border-blue-500 bg-blue-50 shadow-md'
                  : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${
                  idx === 0 ? 'bg-yellow-400 text-yellow-900' : idx === 1 ? 'bg-gray-300 text-gray-700' : idx === 2 ? 'bg-orange-300 text-orange-800' : 'bg-gray-100 text-gray-500'
                }`}>
                  {t.rank || idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight mb-1.5">{t.title}</p>
                  
                  {/* Badges row */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <Badge className={`text-[10px] ${HOOK_COLORS[t.hook_type] || 'bg-gray-100 text-gray-700'}`}>
                      {(t.hook_type || '').replace(/_/g, ' ')}
                    </Badge>
                    {t.clickbait_trigger && (
                      <span className={`text-[10px] font-bold uppercase ${triggerColor}`}>
                        <Flame className="w-2.5 h-2.5 inline mr-0.5" />
                        {t.clickbait_trigger}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400">{t.char_count} chars</span>
                    {t.target_keyword && (
                      <Badge variant="outline" className="text-[10px] gap-0.5">
                        <Search className="w-2.5 h-2.5" />{t.target_keyword}
                      </Badge>
                    )}
                  </div>

                  {/* Score bars */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-[9px] text-gray-400 uppercase font-semibold flex items-center gap-0.5">
                        <Eye className="w-2.5 h-2.5" /> Scroll-Stop
                      </span>
                      <ScoreBar score={t.scroll_stop_score || 7} color={
                        (t.scroll_stop_score || 7) >= 9 ? 'bg-green-500' : (t.scroll_stop_score || 7) >= 7 ? 'bg-amber-500' : 'bg-gray-400'
                      } />
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400 uppercase font-semibold flex items-center gap-0.5">
                        <Search className="w-2.5 h-2.5" /> Keywords
                      </span>
                      <ScoreBar score={t.keyword_density_score || 7} color="bg-blue-500" />
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400 uppercase font-semibold flex items-center gap-0.5">
                        <Target className="w-2.5 h-2.5" /> Thumb Pair
                      </span>
                      <ScoreBar score={t.thumbnail_pairing_score || 7} color="bg-purple-500" />
                    </div>
                  </div>

                  {t.why_it_works && (
                    <p className="text-[11px] text-gray-500 mt-1.5 italic">{t.why_it_works}</p>
                  )}
                </div>
                <CopyBtn text={t.title} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}