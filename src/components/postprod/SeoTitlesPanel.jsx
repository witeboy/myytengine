import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Copy, CheckCircle2, Zap, TrendingUp, Search, Star
} from 'lucide-react';

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost" size="icon"
      className="h-7 w-7"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
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
              <span className="text-sm font-semibold text-blue-900">SEO Analysis</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="bg-white/70 rounded-lg p-2">
                <span className="text-gray-500 block">Primary Keyword</span>
                <span className="font-semibold">{seoAnalysis.primary_keyword}</span>
              </div>
              <div className="bg-white/70 rounded-lg p-2">
                <span className="text-gray-500 block">Search Volume</span>
                <span className="font-semibold">{seoAnalysis.estimated_search_volume}</span>
              </div>
              <div className="bg-white/70 rounded-lg p-2">
                <span className="text-gray-500 block">Competition</span>
                <span className="font-semibold capitalize">{seoAnalysis.competition}</span>
              </div>
              <div className="bg-white/70 rounded-lg p-2">
                <span className="text-gray-500 block">Best Upload</span>
                <span className="font-semibold">{seoAnalysis.recommended_upload_day} {seoAnalysis.recommended_upload_time}</span>
              </div>
            </div>
            {seoAnalysis.trending_angle && (
              <p className="text-xs text-blue-800 mt-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> {seoAnalysis.trending_angle}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Titles Grid */}
      <div className="space-y-2">
        {titles.map((t, idx) => (
          <div
            key={idx}
            onClick={() => onToggleTitle?.(t)}
            className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
              isSelected(t)
                ? 'border-blue-500 bg-blue-50 shadow-md'
                : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${
              idx === 0 ? 'bg-yellow-400 text-yellow-900' : idx === 1 ? 'bg-gray-300 text-gray-700' : idx === 2 ? 'bg-orange-300 text-orange-800' : 'bg-gray-100 text-gray-500'
            }`}>
              {t.rank || idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">{t.title}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge className={`text-[10px] ${HOOK_COLORS[t.hook_type] || 'bg-gray-100 text-gray-700'}`}>
                  {(t.hook_type || '').replace(/_/g, ' ')}
                </Badge>
                <span className="text-[10px] text-gray-400">{t.char_count} chars</span>
                <div className="flex items-center gap-0.5 text-[10px]">
                  <Zap className="w-3 h-3 text-amber-500" />
                  <span className="text-amber-700 font-semibold">{t.scroll_stop_score}/10</span>
                </div>
              </div>
              {t.why_it_works && (
                <p className="text-[11px] text-gray-500 mt-1">{t.why_it_works}</p>
              )}
            </div>
            <CopyBtn text={t.title} />
          </div>
        ))}
      </div>
    </div>
  );
}