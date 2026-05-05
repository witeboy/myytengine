import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { invokeLLM } from '@/lib/invokeLLM';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2, Sparkles, Brain, ListChecks, CalendarPlus, CheckCircle2,
  ChevronDown, ChevronUp, X, TrendingUp
} from 'lucide-react';

const STEP_LABELS = ['Analyze', 'Summary', 'Generate Titles', 'Review & Schedule'];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-1 mb-4">
      {STEP_LABELS.map((label, i) => (
        <React.Fragment key={i}>
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${
            i < current ? 'bg-green-100 text-green-700' :
            i === current ? 'bg-blue-100 text-blue-700' :
            'bg-gray-100 text-gray-400'
          }`}>
            {i < current ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-3 text-center">{i + 1}</span>}
            <span className="hidden sm:inline">{label}</span>
          </div>
          {i < STEP_LABELS.length - 1 && <div className="w-4 h-px bg-gray-200" />}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function AITitleGenerator({ open, onOpenChange, channel, existingTopics, onComplete }) {
  const [step, setStep] = useState(0); // 0=analyzing, 1=summary, 2=generating, 3=review
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState('');
  const [summary, setSummary] = useState(null);
  const [titles, setTitles] = useState([]);
  const [selectedTitles, setSelectedTitles] = useState(new Set());
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [scheduling, setScheduling] = useState(false);
  const [done, setDone] = useState(false);
  const [scheduledCount, setScheduledCount] = useState(0);

  const reset = () => {
    setStep(0); setLoading(false); setPhase(''); setSummary(null);
    setTitles([]); setSelectedTitles(new Set()); setExpandedCategories(new Set());
    setScheduling(false); setDone(false); setScheduledCount(0);
  };

  const handleStart = async () => {
    setStep(0);
    setLoading(true);
    setPhase('Analyzing channel content, niche trends, and existing topics...');

    const existingTitlesList = (existingTopics || []).map(t => t.title).slice(0, 200);
    let strategy = null;
    try { strategy = channel.script_strategy ? JSON.parse(channel.script_strategy) : null; } catch (_) {}

    const summaryResult = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a YouTube channel strategist and SEO expert. Analyze this channel deeply and produce a strategic summary.

CHANNEL: "${channel.name}"
NICHE: ${channel.niche_label || channel.niche}
TONE: ${channel.tone || 'dramatic'}
SCRIPT MODE: ${channel.script_mode || 'standard'}
CONTENT CADENCE: ${channel.shorts_per_day || 5} shorts/day, ${channel.longform_per_week || 3} long-form/week
${strategy ? `VIRAL STRATEGY: Hook=${strategy.hook_formula || ''}, Structure=${JSON.stringify(strategy.structure || '')}, Pacing=${strategy.pacing || ''}` : ''}

EXISTING TOPICS (${existingTitlesList.length} total):
${existingTitlesList.slice(0, 100).map((t, i) => `${i + 1}. ${t}`).join('\n')}

AI INSIGHTS: ${channel.ai_insights || 'none'}

Produce a COMPREHENSIVE channel analysis:
1. Content positioning — what makes this channel unique
2. Audience profile — who watches and why
3. Content gaps — what's missing from the topic library
4. Trend opportunities — emerging topics in the niche
5. SEO strengths/weaknesses in existing titles
6. Recommended content pillars (5-7 thematic clusters)
7. Suggested posting strategy optimization
8. Competitive edge analysis

Be specific, data-driven, and actionable.`,
      response_json_schema: {
        type: "object",
        properties: {
          channel_positioning: { type: "string" },
          audience_profile: { type: "string" },
          content_gaps: { type: "array", items: { type: "string" } },
          trend_opportunities: { type: "array", items: { type: "string" } },
          seo_analysis: { type: "string" },
          content_pillars: { type: "array", items: { type: "object", properties: { name: { type: "string" }, description: { type: "string" } } } },
          posting_strategy: { type: "string" },
          competitive_edge: { type: "string" },
          overall_score: { type: "number" },
          top_recommendation: { type: "string" }
        }
      },
      add_context_from_internet: true
    });

    setSummary(summaryResult);
    setStep(1);
    setLoading(false);
  };

  const handleGenerateTitles = async () => {
    setStep(2);
    setLoading(true);

    const existingTitlesList = (existingTopics || []).map(t => t.title);
    const pillarsStr = (summary?.content_pillars || []).map(p => `${p.name}: ${p.description}`).join('\n');
    const gapsStr = (summary?.content_gaps || []).join(', ');
    const trendsStr = (summary?.trend_opportunities || []).join(', ');

    // Generate in 2 batches of 50 to avoid token limits
    const allTitles = [];

    for (let batch = 0; batch < 2; batch++) {
      setPhase(`Generating titles ${batch * 50 + 1}-${(batch + 1) * 50}...`);

      const batchPrompt = `You are an elite YouTube SEO strategist. Generate exactly 50 HIGH-CTR video titles for this channel.

CHANNEL: "${channel.name}" | NICHE: ${channel.niche_label || channel.niche}
TONE: ${channel.tone || 'dramatic'} | MODE: ${channel.script_mode || 'standard'}
CADENCE: ${channel.shorts_per_day || 5} shorts/day, ${channel.longform_per_week || 3} long-form/week

CONTENT PILLARS:
${pillarsStr}

CONTENT GAPS TO FILL: ${gapsStr}
TREND OPPORTUNITIES: ${trendsStr}
CHANNEL POSITIONING: ${summary?.channel_positioning || ''}

EXISTING TITLES (avoid duplicates):
${existingTitlesList.slice(0, 80).map(t => `- ${t}`).join('\n')}

${batch === 1 ? `TITLES ALREADY GENERATED (batch 1 — avoid overlap):\n${allTitles.map(t => `- ${t.title}`).join('\n')}` : ''}

REQUIREMENTS:
- Each title must be SEO-optimized with high search volume keywords
- Use proven CTR formulas: curiosity gaps, numbers, power words, emotional triggers
- Mix formats: How-to, Listicles, Stories, Comparisons, Controversies, Tutorials, Myths
- Assign each title a content pillar category
- Assign format: "short" for viral/quick topics, "long" for deep-dive/story topics
- Give each a CTR score (1-100) based on keyword strength and hook quality
- Titles should be 40-65 characters for optimal CTR
- Include a trend_score (0-100) based on current search trends
- Include a brief SEO note explaining the keyword strategy

Return EXACTLY 50 titles.`;

      const schema = {
        type: "object",
        properties: {
          titles: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                category: { type: "string" },
                format: { type: "string" },
                ctr_score: { type: "number" },
                trend_score: { type: "number" },
                seo_note: { type: "string" }
              }
            }
          }
        }
      };

      let batchResult = null;
      try {
        batchResult = await base44.integrations.Core.InvokeLLM({
          prompt: batchPrompt,
          response_json_schema: schema,
          model: 'gemini_3_flash',
          add_context_from_internet: true,
        });
      } catch (e1) {
        console.warn('Gemini flash failed, retrying without internet:', e1.message);
        try {
          batchResult = await base44.integrations.Core.InvokeLLM({
            prompt: batchPrompt,
            response_json_schema: schema,
            model: 'gemini_3_flash',
          });
        } catch (e2) {
          console.warn('Gemini flash retry also failed:', e2.message);
          batchResult = await base44.integrations.Core.InvokeLLM({
            prompt: batchPrompt,
            response_json_schema: schema,
          });
        }
      }

      const batchTitles = batchResult?.titles || [];
      allTitles.push(...batchTitles);

      // If we got very few titles, try one more补充 batch
      if (batchTitles.length < 30 && batch === 1) {
        setPhase(`Generating additional titles...`);
        try {
          const extra = await base44.integrations.Core.InvokeLLM({
            prompt: batchPrompt + `\n\nYou MUST return at least ${50 - batchTitles.length} titles. The previous attempt only returned ${batchTitles.length}.`,
            response_json_schema: schema,
            model: 'gemini_3_flash',
          });
          allTitles.push(...(extra?.titles || []));
        } catch (_) {}
      }
    }

    // Sort by CTR score descending
    allTitles.sort((a, b) => (b.ctr_score || 0) - (a.ctr_score || 0));

    setTitles(allTitles);
    // Select all by default
    setSelectedTitles(new Set(allTitles.map((_, i) => i)));
    // Expand all categories
    const cats = new Set(allTitles.map(t => t.category));
    setExpandedCategories(cats);
    setStep(3);
    setLoading(false);
  };

  const handleScheduleAll = async () => {
    setScheduling(true);
    setPhase('Creating topics and scheduling across calendar...');

    const selected = titles.filter((_, i) => selectedTitles.has(i));
    const shortsPerDay = channel.shorts_per_day || 5;
    const longPerWeek = channel.longform_per_week || 3;

    const shorts = selected.filter(t => (t.format || '').toLowerCase() === 'short');
    const longs = selected.filter(t => (t.format || '').toLowerCase() !== 'short');

    // Build date assignments starting tomorrow
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);

    const topicsToCreate = [];
    let shortIdx = 0;
    let longIdx = 0;
    let longsThisWeek = 0;
    let currentWeekStart = new Date(startDate);

    for (let dayOffset = 0; dayOffset < 365 && (shortIdx < shorts.length || longIdx < longs.length); dayOffset++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + dayOffset);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const dayOfWeek = date.getDay();

      // Reset weekly long count on Monday
      if (dayOfWeek === 1) {
        longsThisWeek = 0;
        currentWeekStart = new Date(date);
      }

      // Assign shorts for this day
      for (let s = 0; s < shortsPerDay && shortIdx < shorts.length; s++) {
        topicsToCreate.push({
          channel_id: channel.id,
          title: shorts[shortIdx].title,
          format: 'short',
          scheduled_date: dateStr,
          status: 'scheduled',
          slot_index: s + 1,
          priority: shortIdx,
          theme_cluster: shorts[shortIdx].category || '',
          trend_score: shorts[shortIdx].trend_score || 0,
          ai_notes: shorts[shortIdx].seo_note || '',
        });
        shortIdx++;
      }

      // Assign long-form (spread across the week)
      if (longsThisWeek < longPerWeek && longIdx < longs.length && dayOfWeek !== 0 && dayOfWeek !== 6) {
        topicsToCreate.push({
          channel_id: channel.id,
          title: longs[longIdx].title,
          format: 'long',
          scheduled_date: dateStr,
          status: 'scheduled',
          slot_index: 1,
          priority: longIdx,
          theme_cluster: longs[longIdx].category || '',
          trend_score: longs[longIdx].trend_score || 0,
          ai_notes: longs[longIdx].seo_note || '',
        });
        longIdx++;
        longsThisWeek++;
      }
    }

    // Bulk create in batches of 50 to avoid timeouts
    setPhase(`Scheduling ${topicsToCreate.length} topics across calendar...`);
    for (let i = 0; i < topicsToCreate.length; i += 50) {
      const batch = topicsToCreate.slice(i, i + 50);
      await base44.entities.ChannelTopics.bulkCreate(batch);
      setPhase(`Scheduled ${Math.min(i + 50, topicsToCreate.length)}/${topicsToCreate.length} topics...`);
    }

    // Update channel stats
    await base44.entities.Channels.update(channel.id, {
      total_topics: (channel.total_topics || 0) + topicsToCreate.length,
      topics_scheduled: (channel.topics_scheduled || 0) + topicsToCreate.length,
    });

    setScheduledCount(topicsToCreate.length);
    setScheduling(false);
    setDone(true);
  };

  const toggleAll = () => {
    if (selectedTitles.size === titles.length) {
      setSelectedTitles(new Set());
    } else {
      setSelectedTitles(new Set(titles.map((_, i) => i)));
    }
  };

  const toggleCategory = (cat) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // Group titles by category
  const groupedTitles = titles.reduce((acc, t, i) => {
    const cat = t.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push({ ...t, _idx: i });
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-600" />
            AI Title Generator — {channel?.name}
          </DialogTitle>
          <DialogDescription>
            AI analyzes your channel, generates 100 SEO-optimized titles, and schedules them for a year.
          </DialogDescription>
        </DialogHeader>

        <StepIndicator current={step} />

        {/* Step 0: Analyzing */}
        {step === 0 && !loading && (
          <div className="py-8 text-center">
            <Brain className="w-12 h-12 mx-auto text-purple-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Ready to Analyze Your Channel</h3>
            <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
              AI will research your niche, analyze existing content, identify gaps, and find trending opportunities.
            </p>
            <Button onClick={handleStart} className="bg-purple-600 hover:bg-purple-700 gap-2">
              <Sparkles className="w-4 h-4" /> Analyze Channel
            </Button>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            <p className="text-sm text-gray-600">{phase || 'Thinking...'}</p>
          </div>
        )}

        {/* Step 1: Summary */}
        {step === 1 && !loading && summary && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 max-h-[50vh] pr-2">
              <div className="space-y-4">
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-purple-600" />
                    <h4 className="font-semibold text-sm text-purple-900">Channel Positioning</h4>
                    {summary.overall_score && (
                      <Badge className="bg-purple-100 text-purple-700 text-[10px] ml-auto">Score: {summary.overall_score}/100</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-700">{summary.channel_positioning}</p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-sm text-blue-900 mb-1">Audience Profile</h4>
                  <p className="text-xs text-gray-700">{summary.audience_profile}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <h4 className="font-semibold text-xs text-amber-900 mb-1.5">Content Gaps</h4>
                    <ul className="space-y-1">
                      {(summary.content_gaps || []).map((g, i) => (
                        <li key={i} className="text-[11px] text-gray-700 flex items-start gap-1">
                          <span className="text-amber-500 mt-0.5">•</span> {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <h4 className="font-semibold text-xs text-green-900 mb-1.5">Trend Opportunities</h4>
                    <ul className="space-y-1">
                      {(summary.trend_opportunities || []).map((t, i) => (
                        <li key={i} className="text-[11px] text-gray-700 flex items-start gap-1">
                          <span className="text-green-500 mt-0.5">•</span> {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="bg-white border rounded-lg p-3">
                  <h4 className="font-semibold text-xs text-gray-900 mb-2">Content Pillars</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {(summary.content_pillars || []).map((p, i) => (
                      <div key={i} className="bg-gray-50 border rounded px-2 py-1" title={p.description}>
                        <span className="text-[11px] font-medium text-gray-800">{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-50 border rounded-lg p-3">
                  <h4 className="font-semibold text-xs text-gray-900 mb-1">SEO Analysis</h4>
                  <p className="text-[11px] text-gray-600">{summary.seo_analysis}</p>
                </div>

                {summary.top_recommendation && (
                  <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
                    <h4 className="font-semibold text-xs text-purple-900 mb-1">🎯 Top Recommendation</h4>
                    <p className="text-xs text-gray-700">{summary.top_recommendation}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
            <DialogFooter className="mt-4 gap-2">
              <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
              <Button onClick={handleGenerateTitles} className="bg-blue-600 hover:bg-blue-700 gap-2">
                <ListChecks className="w-4 h-4" /> Generate 100 Titles
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Review Titles */}
        {step === 3 && !loading && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-100 text-blue-700 text-xs">{titles.length} titles</Badge>
                <Badge className="bg-green-100 text-green-700 text-xs">{selectedTitles.size} selected</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs">
                {selectedTitles.size === titles.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>

            <ScrollArea className="flex-1 max-h-[45vh] pr-2">
              <div className="space-y-2">
                {Object.entries(groupedTitles).map(([cat, items]) => (
                  <div key={cat} className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleCategory(cat)}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      {expandedCategories.has(cat)
                        ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                        : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      }
                      <span className="text-xs font-semibold text-gray-800">{cat}</span>
                      <Badge className="text-[9px] bg-gray-200 text-gray-600">{items.length}</Badge>
                      <span className="ml-auto text-[10px] text-gray-400">
                        {items.filter(t => selectedTitles.has(t._idx)).length} selected
                      </span>
                    </button>
                    {expandedCategories.has(cat) && (
                      <div className="divide-y divide-gray-50">
                        {items.map((t) => (
                          <div
                            key={t._idx}
                            className={`flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors ${
                              selectedTitles.has(t._idx) ? 'bg-blue-50/50' : 'hover:bg-gray-50'
                            }`}
                            onClick={() => {
                              setSelectedTitles(prev => {
                                const next = new Set(prev);
                                if (next.has(t._idx)) next.delete(t._idx); else next.add(t._idx);
                                return next;
                              });
                            }}
                          >
                            <Checkbox checked={selectedTitles.has(t._idx)} className="mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-800">{t.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge className={`text-[8px] ${t.format === 'short' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                                  {t.format === 'short' ? 'Short' : 'Long'}
                                </Badge>
                                <span className="text-[10px] text-gray-400">CTR: {t.ctr_score}</span>
                                {t.trend_score > 70 && (
                                  <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                                    <TrendingUp className="w-2.5 h-2.5" /> {t.trend_score}
                                  </span>
                                )}
                              </div>
                              {t.seo_note && <p className="text-[10px] text-gray-400 mt-0.5">{t.seo_note}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            {scheduling && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mt-3 flex items-center gap-2 text-xs text-purple-700">
                <Loader2 className="w-4 h-4 animate-spin" />
                {phase}
              </div>
            )}

            {done && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3 text-center">
                <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-1" />
                <p className="text-sm font-semibold text-green-800">{scheduledCount} topics scheduled!</p>
                <p className="text-[11px] text-green-600">Content spread across your calendar for the next year.</p>
              </div>
            )}

            <DialogFooter className="mt-3 gap-2">
              {!done ? (
                <>
                  <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                  <Button
                    onClick={handleScheduleAll}
                    disabled={scheduling || selectedTitles.size === 0}
                    className="bg-green-600 hover:bg-green-700 gap-2"
                  >
                    <CalendarPlus className="w-4 h-4" />
                    Schedule {selectedTitles.size} Titles
                  </Button>
                </>
              ) : (
                <Button onClick={() => { reset(); onOpenChange(false); onComplete?.(); }} className="bg-blue-600 hover:bg-blue-700">
                  Done
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}