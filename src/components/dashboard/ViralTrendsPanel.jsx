import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  TrendingUp, Flame, RefreshCw, Loader2, ExternalLink, Zap, Globe, Target
} from 'lucide-react';

export default function ViralTrendsPanel({ channels }) {
  const [nicheViral, setNicheViral] = useState(null);
  const [globalViral, setGlobalViral] = useState(null);
  const [loadingNiche, setLoadingNiche] = useState(false);
  const [loadingGlobal, setLoadingGlobal] = useState(false);

  const niches = channels.map(c => c.niche_label || c.niche).filter(Boolean);
  const uniqueNiches = [...new Set(niches)];

  const fetchNicheViral = async () => {
    setLoadingNiche(true);
    const nicheList = uniqueNiches.join(', ');
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a YouTube trend analyst. For each of these niches: ${nicheList}

Identify the TOP 3 most viral/trending topics RIGHT NOW on YouTube for each niche. Consider:
- Videos blowing up in the last 7 days
- Topics with sudden search volume spikes
- Formats that are getting massive engagement

For each topic provide: the topic title, why it's going viral, estimated view potential, and a ready-to-use video title.`,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
      response_json_schema: {
        type: 'object',
        properties: {
          niches: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                niche: { type: 'string' },
                trends: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      topic: { type: 'string' },
                      why_viral: { type: 'string' },
                      view_potential: { type: 'string' },
                      suggested_title: { type: 'string' },
                      urgency: { type: 'string', enum: ['trending_now', 'rising_fast', 'steady_growth'] },
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
    setNicheViral(result);
    setLoadingNiche(false);
  };

  const fetchGlobalViral = async () => {
    setLoadingGlobal(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a YouTube trend analyst. What are the TOP 10 most viral topics/videos on YouTube RIGHT NOW across ALL categories?

Consider what's trending, what videos are blowing up, what challenges/events/news are driving views. Include:
- The topic/video title
- The category (entertainment, news, gaming, education, etc.)
- Why it's going viral
- View count or estimated engagement
- How a faceless/AI content creator could make a video on this topic`,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
      response_json_schema: {
        type: 'object',
        properties: {
          trends: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rank: { type: 'number' },
                topic: { type: 'string' },
                category: { type: 'string' },
                why_viral: { type: 'string' },
                engagement: { type: 'string' },
                faceless_angle: { type: 'string' },
              }
            }
          },
          summary: { type: 'string' }
        }
      }
    });
    setGlobalViral(result);
    setLoadingGlobal(false);
  };

  const urgencyBadge = (u) => {
    if (u === 'trending_now') return <Badge className="text-[9px] bg-red-100 text-red-700"><Flame className="w-3 h-3 mr-0.5" />NOW</Badge>;
    if (u === 'rising_fast') return <Badge className="text-[9px] bg-orange-100 text-orange-700"><TrendingUp className="w-3 h-3 mr-0.5" />Rising</Badge>;
    return <Badge className="text-[9px] bg-blue-100 text-blue-700">Steady</Badge>;
  };

  return (
    <Card className="border-0 shadow-lg bg-white/90 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
              <Flame className="w-4 h-4 text-white" />
            </div>
            <CardTitle className="text-lg">What's Viral Right Now</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="niche">
          <TabsList className="mb-4">
            <TabsTrigger value="niche" className="gap-1"><Target className="w-3.5 h-3.5" /> My Niches</TabsTrigger>
            <TabsTrigger value="global" className="gap-1"><Globe className="w-3.5 h-3.5" /> All YouTube</TabsTrigger>
          </TabsList>

          {/* Niche-specific viral */}
          <TabsContent value="niche">
            {!nicheViral && !loadingNiche && (
              <div className="text-center py-8">
                <Target className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 mb-3">Discover what's viral in your niches right now</p>
                <Button onClick={fetchNicheViral} className="bg-gradient-to-r from-red-500 to-orange-500 text-white">
                  <Zap className="w-4 h-4 mr-2" /> Scan My Niches
                </Button>
              </div>
            )}
            {loadingNiche && (
              <div className="flex items-center justify-center py-12 gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                <span className="text-sm text-gray-500">Scanning trends across your niches...</span>
              </div>
            )}
            {nicheViral?.niches && (
              <div className="space-y-5">
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={fetchNicheViral} className="text-xs"><RefreshCw className="w-3 h-3 mr-1" /> Refresh</Button>
                </div>
                {nicheViral.niches.map((n, i) => (
                  <div key={i}>
                    <h4 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-400" />
                      {n.niche}
                    </h4>
                    <div className="space-y-2">
                      {(n.trends || []).map((t, j) => (
                        <div key={j} className="p-3 rounded-lg border border-gray-100 hover:border-orange-200 hover:bg-orange-50/30 transition-all">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {urgencyBadge(t.urgency)}
                                <p className="text-sm font-medium text-gray-900 truncate">{t.topic}</p>
                              </div>
                              <p className="text-xs text-gray-500 mb-1">{t.why_viral}</p>
                              <p className="text-xs text-blue-600 font-medium">💡 {t.suggested_title}</p>
                            </div>
                            <Badge className="text-[9px] bg-green-50 text-green-700 flex-shrink-0">{t.view_potential}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Global viral */}
          <TabsContent value="global">
            {!globalViral && !loadingGlobal && (
              <div className="text-center py-8">
                <Globe className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 mb-3">See what's blowing up across all of YouTube</p>
                <Button onClick={fetchGlobalViral} className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                  <Zap className="w-4 h-4 mr-2" /> Scan YouTube
                </Button>
              </div>
            )}
            {loadingGlobal && (
              <div className="flex items-center justify-center py-12 gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                <span className="text-sm text-gray-500">Scanning global YouTube trends...</span>
              </div>
            )}
            {globalViral?.trends && (
              <div className="space-y-2">
                <div className="flex justify-between items-center mb-2">
                  {globalViral.summary && <p className="text-xs text-gray-500 italic flex-1">{globalViral.summary}</p>}
                  <Button variant="ghost" size="sm" onClick={fetchGlobalViral} className="text-xs flex-shrink-0"><RefreshCw className="w-3 h-3 mr-1" /> Refresh</Button>
                </div>
                {globalViral.trends.map((t, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">
                      {t.rank || i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{t.topic}</p>
                        <Badge className="text-[9px] bg-gray-100 text-gray-600 flex-shrink-0">{t.category}</Badge>
                      </div>
                      <p className="text-xs text-gray-500 mb-1">{t.why_viral}</p>
                      <p className="text-xs text-purple-600">🎬 {t.faceless_angle}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{t.engagement}</span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}