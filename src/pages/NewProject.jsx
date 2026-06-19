import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createPageUrl } from '@/utils';
import {
  Loader2, Sparkles, Film, Users, RefreshCw, ArrowRight,
  ArrowLeft, Search, Shield, Lightbulb, Pencil, Image, ClipboardPaste
} from 'lucide-react';
import ProjectTemplates from '@/components/templates/ProjectTemplates';
import MakeThumbnail from '@/components/production/MakeThumbnail';
import ProjectModePicker from '@/components/script/ProjectModePicker';

const TONE_OPTIONS = [
  { value: 'dramatic',      label: '🎭 Dramatic' },
  { value: 'educational',   label: '📚 Educational' },
  { value: 'humorous',      label: '😂 Humorous' },
  { value: 'conversational',label: '💬 Conversational' },
  { value: 'inspirational', label: '✨ Inspirational' },
  { value: 'suspenseful',   label: '🔥 Suspenseful' },
  { value: 'sarcastic',     label: '😏 Sarcastic' },
];

const PROJECT_TYPES = [
  {
    id: 'faceless',
    name: 'Faceless Video',
    description: 'AI-generated narrated videos with scene images, voiceover, and music.',
    icon: Film,
    color: 'from-blue-500 to-indigo-600',
    bgColor: 'bg-blue-50 border-blue-200 hover:border-blue-400',
    emoji: '🎬',
  },
  {
    id: 'thumbnail',
    name: 'Make Thumbnail',
    description: 'AI creates world-class CTR thumbnails from your title, mood & character photos.',
    icon: Image,
    color: 'from-fuchsia-500 to-pink-600',
    bgColor: 'bg-fuchsia-50 border-fuchsia-200 hover:border-fuchsia-400',
    emoji: '🎯',
    badge: 'NEW',
  },
  {
    id: 'ugc',
    name: 'UGC Creator',
    description: 'Generate AI influencer videos with lip-sync, voice, and environment.',
    icon: Users,
    color: 'from-pink-500 to-rose-600',
    bgColor: 'bg-pink-50 border-pink-200 hover:border-pink-400',
    emoji: '🧑‍🎤',
  },
  {
    id: 'repurpose',
    name: 'Content Repurpose',
    description: 'Analyze a high-performing YouTube video and recreate it with your twist.',
    icon: RefreshCw,
    color: 'from-emerald-500 to-teal-600',
    bgColor: 'bg-emerald-50 border-emerald-200 hover:border-emerald-400',
    emoji: '♻️',
  },
  {
    id: 'niche',
    name: 'Niche Research',
    description: 'Find profitable YouTube niches with viral gaps and high-RPM opportunities.',
    icon: Search,
    color: 'from-violet-500 to-purple-600',
    bgColor: 'bg-violet-50 border-violet-200 hover:border-violet-400',
    emoji: '🔍',
  },
  {
    id: 'audit',
    name: 'Channel Auditor',
    description: 'Deep-dive monetized channels for CTR, retention, and profit signals.',
    icon: Shield,
    color: 'from-amber-500 to-orange-600',
    bgColor: 'bg-amber-50 border-amber-200 hover:border-amber-400',
    emoji: '🏆',
  },
];

export default function NewProject() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState(null);
  const [mode, setMode] = useState(null);
  const [niche, setNiche] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [tone, setTone] = useState('dramatic');
  const [targetAudience, setTargetAudience] = useState('');
  const [loading, setLoading] = useState(false);
  const [pasteScript, setPasteScript] = useState('');
  const [pastePipeline, setPastePipeline] = useState('');
  const [pasteName, setPasteName] = useState('');
  // Project mode for "I Have a Topic" / "Suggest Topics" flows — chosen BEFORE script generation
  const [projectMode, setProjectMode] = useState('standard');
  const [explainerArc, setExplainerArc] = useState('professor');

  // Helper — build the project_mode + explainer_arc payload pieces from the picker state
  const modePayload = () => {
    const m = projectMode === 'standard' ? '' : projectMode;
    const payload = { project_mode: m };
    if (projectMode === 'explainer') payload.explainer_arc = explainerArc;
    if (projectMode === 'youtube_shorts' || projectMode === 'shorts') payload.orientation = 'portrait';
    return payload;
  };

  const [error, setError] = useState('');

  const handleCreateFromNiche = async () => {
    if (!niche.trim()) return;
    setLoading(true);
    setError('');
    try {
      const project = await base44.entities.Projects.create({
        name: niche.trim(),
        niche: niche.trim(),
        tone,
        target_audience: targetAudience.trim() || undefined,
        status: 'created',
        current_step: 0,
        ...modePayload(),
      });
      await base44.functions.invoke('generateTopics', {
        project_id: project.id,
        niche: niche.trim(),
        tone,
        target_audience: targetAudience.trim() || undefined,
      });
      navigate(createPageUrl(`StoryTopics?project_id=${project.id}`));
    } catch (err) {
      console.error('generateTopics (niche) failed:', err);
      setError(err?.response?.data?.error || err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const handleCreateFromTopic = async () => {
    if (!customTopic.trim()) return;
    setLoading(true);
    setError('');
    try {
      // "I Have a Topic" — use the user's EXACT topic. No AI topic generation.
      const project = await base44.entities.Projects.create({
        name: customTopic.trim(),
        niche: customTopic.trim(),
        tone,
        target_audience: targetAudience.trim() || undefined,
        status: 'topic_selected',
        current_step: 1,
        ...modePayload(),
      });
      // Create the topic directly from what the user typed, mark it selected.
      const topic = await base44.entities.Topics.create({
        project_id: project.id,
        rank: 1,
        title: customTopic.trim(),
        description: targetAudience.trim() ? `For ${targetAudience.trim()}` : '',
        is_selected: true,
      });
      await base44.entities.Projects.update(project.id, {
        selected_topic_id: topic.id,
      });
      navigate(createPageUrl(`StoryDuration?project_id=${project.id}`));
    } catch (err) {
      console.error('create from topic failed:', err);
      setError(err?.response?.data?.error || err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  // ── Thumbnail mode — render full-screen ──────────────────────────────
  if (selectedType === 'thumbnail') {
    return <MakeThumbnail onBack={() => setSelectedType(null)} />;
  }

  // ── Project type picker ──────────────────────────────────────────────
  if (!selectedType) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="max-w-4xl mx-auto py-8">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Create New Project</h1>
            <p className="text-gray-500">Choose your project type to get started</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {PROJECT_TYPES.map(type => (
              <Card
                key={type.id}
                className={`cursor-pointer transition-all duration-200 border-2 ${type.bgColor} hover:shadow-lg group relative`}
                onClick={() => {
                  if (type.id === 'ugc')       navigate(createPageUrl('UGCPipeline'));
                  else if (type.id === 'repurpose') navigate(createPageUrl('ContentRepurpose'));
                  else if (type.id === 'niche')    navigate(createPageUrl('ResearchTerminal'));
                  else if (type.id === 'audit')    navigate(createPageUrl('ChannelAuditor'));
                  else setSelectedType(type.id);
                }}
              >
                {/* NEW badge for thumbnail */}
                {type.badge && (
                  <div style={{
                    position: 'absolute', top: 12, right: 12,
                    background: 'linear-gradient(135deg, #d946ef, #ec4899)',
                    color: '#fff', borderRadius: 6, padding: '2px 8px',
                    fontSize: 11, fontWeight: 800, letterSpacing: '0.05em',
                    boxShadow: '0 2px 8px rgba(217,70,239,0.4)',
                  }}>
                    {type.badge}
                  </div>
                )}
                <CardContent className="p-6 text-center space-y-4">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${type.color} flex items-center justify-center mx-auto shadow-lg`}>
                    <span className="text-3xl">{type.emoji}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">{type.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{type.description}</p>
                  </div>
                  <div className="flex items-center justify-center gap-1 text-sm font-medium text-gray-400 group-hover:text-blue-600 transition-colors">
                    Get Started <ArrowRight className="w-4 h-4" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Faceless video creation flow ────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-5xl mx-auto space-y-8 py-8">
        <Button variant="ghost" onClick={() => { setSelectedType(null); setMode(null); }} className="gap-2 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to project types
        </Button>

        {/* Mode selection */}
        {!mode && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <Sparkles className="w-10 h-10 text-blue-600 mx-auto mb-2" />
              <h2 className="text-2xl font-bold">New Faceless Video</h2>
              <p className="text-gray-500 text-sm mt-1">How would you like to start?</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card
                className="cursor-pointer border-2 border-gray-200 hover:border-blue-400 hover:shadow-lg transition-all group"
                onClick={() => setMode('topic')}
              >
                <CardContent className="p-6 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto">
                    <Pencil className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-lg font-bold">I Have a Topic</h3>
                  <p className="text-sm text-gray-500">Enter your exact video topic and use it as-is — straight into the pipeline.</p>
                  <div className="flex items-center justify-center gap-1 text-sm font-medium text-gray-400 group-hover:text-blue-600 transition-colors">
                    Start <ArrowRight className="w-4 h-4" />
                  </div>
                </CardContent>
              </Card>
              <Card
                className="cursor-pointer border-2 border-gray-200 hover:border-purple-400 hover:shadow-lg transition-all group"
                onClick={() => setMode('niche')}
              >
                <CardContent className="p-6 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center mx-auto">
                    <Lightbulb className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-lg font-bold">Suggest Topics</h3>
                  <p className="text-sm text-gray-500">Enter a niche and AI will generate 5 viral topic ideas for you to choose from.</p>
                  <div className="flex items-center justify-center gap-1 text-sm font-medium text-gray-400 group-hover:text-purple-600 transition-colors">
                    Start <ArrowRight className="w-4 h-4" />
                  </div>
                </CardContent>
              </Card>
              <Card
                className="cursor-pointer border-2 border-gray-200 hover:border-green-400 hover:shadow-lg transition-all group"
                onClick={() => setMode('paste')}
              >
                <CardContent className="p-6 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mx-auto">
                    <ClipboardPaste className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-lg font-bold">I Have a Script</h3>
                  <p className="text-sm text-gray-500">Paste your ready-made script. Skip AI generation and go straight to content.</p>
                  <div className="flex items-center justify-center gap-1 text-sm font-medium text-gray-400 group-hover:text-green-600 transition-colors">
                    Start <ArrowRight className="w-4 h-4" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Own topic flow */}
        {mode === 'topic' && (
          <Card className="w-full max-w-lg mx-auto">
            <CardHeader className="text-center">
              <Pencil className="w-10 h-10 text-blue-600 mx-auto mb-2" />
              <CardTitle className="text-2xl">Your Video Topic</CardTitle>
              <p className="text-gray-500 text-sm mt-1">Enter your exact video topic — it's used as-is, no AI topic generation</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="e.g. Why 90% of people fail at intermittent fasting — the hidden science nobody talks about"
                value={customTopic}
                onChange={e => setCustomTopic(e.target.value)}
                disabled={loading}
                className="text-base min-h-[100px]"
              />
              <ProjectModePicker
                mode={projectMode}
                onModeChange={setProjectMode}
                arc={explainerArc}
                onArcChange={setExplainerArc}
                disabled={loading}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Tone</label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Target Audience <span className="text-gray-400">(optional)</span></label>
                  <Input placeholder="e.g. young adults 18-25" value={targetAudience} onChange={e => setTargetAudience(e.target.value)} disabled={loading} />
                </div>
              </div>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMode(null)} disabled={loading}>Back</Button>
                <Button onClick={handleCreateFromTopic} disabled={!customTopic.trim() || loading} className="flex-1 bg-blue-600 hover:bg-blue-700" size="lg">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating...</> : 'Create Project'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Niche suggestion flow */}
        {mode === 'niche' && (
          <Card className="w-full max-w-lg mx-auto">
            <CardHeader className="text-center">
              <Lightbulb className="w-10 h-10 text-purple-600 mx-auto mb-2" />
              <CardTitle className="text-2xl">Explore a Niche</CardTitle>
              <p className="text-gray-500 text-sm mt-1">Enter a niche and AI will suggest 5 viral topics</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="e.g. True Crime, Tech Reviews, History..."
                value={niche}
                onChange={e => setNiche(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateFromNiche()}
                disabled={loading}
                className="text-lg py-6"
              />
              <ProjectModePicker
                mode={projectMode}
                onModeChange={setProjectMode}
                arc={explainerArc}
                onArcChange={setExplainerArc}
                disabled={loading}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Tone</label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Target Audience <span className="text-gray-400">(optional)</span></label>
                  <Input placeholder="e.g. tech enthusiasts, parents" value={targetAudience} onChange={e => setTargetAudience(e.target.value)} disabled={loading} />
                </div>
              </div>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMode(null)} disabled={loading}>Back</Button>
                <Button onClick={handleCreateFromNiche} disabled={!niche.trim() || loading} className="flex-1 bg-purple-600 hover:bg-purple-700" size="lg">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating Topics...</> : 'Generate 5 Topic Ideas'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Paste own script flow */}
        {mode === 'paste' && (
          <Card className="w-full max-w-lg mx-auto">
            <CardHeader className="text-center">
              <ClipboardPaste className="w-10 h-10 text-green-600 mx-auto mb-2" />
              <CardTitle className="text-2xl">Paste Your Script</CardTitle>
              <p className="text-gray-500 text-sm mt-1">Skip AI script generation — paste your ready-made script and go straight to content</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Project Name</label>
                <Input
                  placeholder="e.g. Your Attention is Worth $200 Billion"
                  value={pasteName}
                  onChange={e => setPasteName(e.target.value)}
                  disabled={loading}
                  className="text-base"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Pipeline Type</label>
                <Select value={pastePipeline} onValueChange={setPastePipeline}>
                  <SelectTrigger><SelectValue placeholder="Select pipeline..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">🎭 Standard (Viral)</SelectItem>
                    <SelectItem value="explainer">📚 Explainer Video</SelectItem>
                    <SelectItem value="story">📖 Story / Fiction</SelectItem>
                    <SelectItem value="youtube_shorts">📱 YouTube Shorts</SelectItem>
                    <SelectItem value="long_viral">🎬 Long Viral</SelectItem>
                    <SelectItem value="sleep_story">🌙 Sleep Story</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Your Script</label>
                <Textarea
                  placeholder="Paste your full script here..."
                  value={pasteScript}
                  onChange={e => setPasteScript(e.target.value)}
                  disabled={loading}
                  className="text-sm min-h-[200px] font-mono"
                />
                {pasteScript && (
                  <p className="text-xs text-gray-400 mt-1">
                    {pasteScript.split(/\s+/).filter(w => w.length > 0).length} words · ~{Math.round(pasteScript.split(/\s+/).filter(w => w.length > 0).length / 150)} min
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMode(null)} disabled={loading}>Back</Button>
                <Button
                  onClick={async () => {
                    if (!pasteScript.trim() || !pastePipeline || !pasteName.trim()) return;
                    setLoading(true);
                    try {
                      const wordCount = pasteScript.split(/\s+/).filter(w => w.length > 0).length;
                      const isShorts = pastePipeline === 'youtube_shorts';
                      const durationMin = isShorts ? 1.5 : Math.max(1, Math.round(wordCount / 150));

                      // 1. Create the project
                      const project = await base44.entities.Projects.create({
                        name: pasteName.trim(),
                        niche: pasteName.trim(),
                        tone: 'dramatic',
                        status: 'script_complete',
                        current_step: 2,
                        project_mode: pastePipeline === 'standard' ? '' : pastePipeline,
                        orientation: isShorts ? 'portrait' : 'landscape',
                        video_duration_minutes: durationMin,
                      });

                      // 2. Create the script entity directly as final_aggregated
                      await base44.entities.Scripts.create({
                        project_id: project.id,
                        version: 'final_aggregated',
                        full_script: pasteScript.trim(),
                        word_count: wordCount,
                        estimated_duration_sec: Math.round((wordCount / 150) * 60),
                        editor_notes: 'User-pasted script (no AI generation)',
                      });

                      // 3. Navigate to ContentGeneration
                      navigate(createPageUrl(`ContentGeneration?project_id=${project.id}`));
                    } catch (err) {
                      console.error('Paste script error:', err);
                      setLoading(false);
                    }
                  }}
                  disabled={!pasteScript.trim() || !pastePipeline || !pasteName.trim() || loading}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  size="lg"
                >
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating Project...</> : 'Save & Continue to Content'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="border-t pt-8">
          <ProjectTemplates />
        </div>
      </div>
    </div>
  );
}