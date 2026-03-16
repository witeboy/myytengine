import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users } from 'lucide-react';
import CompetitorInput from '@/components/competitors/CompetitorInput';
import CompetitorCard from '@/components/competitors/CompetitorCard';
import AISummaryPanel from '@/components/competitors/AISummaryPanel';

export default function CompetitorMonitor() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [competitors, setCompetitors] = useState([]);
  const [aiSummary, setAiSummary] = useState(null);
  const [error, setError] = useState(null);

  const handleAnalyze = async (channelIds, niche) => {
    setLoading(true);
    setError(null);
    setCompetitors([]);
    setAiSummary(null);

    const res = await base44.functions.invoke('analyzeCompetitors', {
      channel_ids: channelIds,
      niche,
    });

    setLoading(false);

    if (res.data?.error) {
      setError(res.data.error);
      return;
    }

    setCompetitors(res.data.competitors || []);
    setAiSummary(res.data.ai_summary || null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Competitor Monitor</h1>
            <p className="text-sm text-gray-500">Track up to 3 competitors side-by-side</p>
          </div>
        </div>

        {/* Input */}
        <div className="mb-6">
          <CompetitorInput onAnalyze={handleAnalyze} loading={loading} />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-16">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Analyzing channels via YouTube API...</p>
            <p className="text-xs text-gray-400 mt-1">Fetching stats, videos & monetization signals</p>
          </div>
        )}

        {/* AI Summary */}
        {aiSummary && (
          <div className="mb-6">
            <AISummaryPanel summary={aiSummary} />
          </div>
        )}

        {/* Competitor Cards */}
        {competitors.length > 0 && (
          <div className={`grid gap-5 ${
            competitors.length === 1 ? 'grid-cols-1 max-w-lg' :
            competitors.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
            'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          }`}>
            {competitors.map((c, i) => (
              <CompetitorCard key={c.channel_id} competitor={c} rank={i + 1} />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && competitors.length === 0 && !error && (
          <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-200 mt-4">
            <div className="text-5xl mb-3">🔍</div>
            <h2 className="text-lg font-bold text-gray-700 mb-2">No competitors analyzed yet</h2>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              Enter up to 3 YouTube channel IDs above to see a detailed side-by-side comparison of their performance, monetization, and growth.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}