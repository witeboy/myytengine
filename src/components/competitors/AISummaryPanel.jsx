import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Trophy, TrendingUp, Lightbulb, Shield } from 'lucide-react';

const THREAT_COLORS = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};

export default function AISummaryPanel({ summary }) {
  if (!summary) return null;

  return (
    <Card className="border-l-4 border-l-purple-500">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <h3 className="text-sm font-bold text-gray-900">AI Competitive Analysis</h3>
          <Badge className={`text-[9px] ml-auto ${THREAT_COLORS[summary.threat_level] || THREAT_COLORS.medium}`}>
            <Shield className="w-2.5 h-2.5 mr-0.5" />
            {summary.threat_level} threat
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {summary.winner && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-100">
              <Trophy className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-yellow-600 font-semibold uppercase">Top Performer</p>
                <p className="text-sm font-bold text-gray-900">{summary.winner}</p>
              </div>
            </div>
          )}
          {summary.fastest_growing && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-100">
              <TrendingUp className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-green-600 font-semibold uppercase">Fastest Growing</p>
                <p className="text-sm font-bold text-gray-900">{summary.fastest_growing}</p>
              </div>
            </div>
          )}
        </div>

        {summary.key_differences?.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Key Differences</p>
            <div className="space-y-1.5">
              {summary.key_differences.map((diff, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-700">
                  <span className="text-blue-500 font-bold flex-shrink-0">→</span>
                  <span>{diff}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {summary.opportunities?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Opportunities to Exploit</p>
            <div className="space-y-1.5">
              {summary.opportunities.map((opp, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-purple-50 border border-purple-100">
                  <Lightbulb className="w-3.5 h-3.5 text-purple-500 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-gray-700">{opp}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}