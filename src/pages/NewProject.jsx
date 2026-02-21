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
import { Loader2, Sparkles, Film, Users, RefreshCw, ArrowRight, ArrowLeft, Search, Shield, Lightbulb, Pencil } from 'lucide-react';
import ProjectTemplates from '@/components/templates/ProjectTemplates';

const TONE_OPTIONS = [
  { value: 'dramatic', label: '🎭 Dramatic' },
  { value: 'educational', label: '📚 Educational' },
  { value: 'humorous', label: '😂 Humorous' },
  { value: 'conversational', label: '💬 Conversational' },
  { value: 'inspirational', label: '✨ Inspirational' },
  { value: 'suspenseful', label: '🔥 Suspenseful' },
  { value: 'sarcastic', label: '😏 Sarcastic' },
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
    description: 'Deep-dive monetized channels for CTR, retention, and profit signals. Not keywords — real data.',
    icon: Shield,
    color: 'from-amber-500 to-orange-600',
    bgColor: 'bg-amber-50 border-amber-200 hover:border-amber-400',
    emoji: '🏆',
  },
];

export default function NewProject() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState(null);
  const [mode, setMode] = useState(null); // 'niche' or 'topic'
  const [niche, setNiche] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [tone, setTone] = useState('dramatic');
  const [targetAudience, setTargetAudience] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateFromNiche = async () => {
    if (!niche.trim()) return;
    setLoading(true);

    const project = await base44.entities.Projects.create({
      name: niche.trim(),
      niche: niche.trim(),
      tone,
      target_audience: targetAudience.trim() || undefined,
      status: 'created',
      current_step: 0,
    });

    await base44.functions.invoke('generateTopics', {
      project_id: project.id,
      niche: niche.trim(),
      tone,
      target_audience: targetAudience.trim() || undefined,
    });

    navigate(createPageUrl(`StoryTopics?project_id=${project.id}`));
  };

  const handleCreateFromTopic = async () => {
    if (!customTopic.trim()) return;
    setLoading(true);

    const project = await base44.entities.Projects.create({
      name: customTopic.trim(),
      niche: customTopic.trim(),
      tone,
      target_audience: targetAudience.trim() || undefined,
      status: 'created',
      current_step: 0,
    });

    // Create a single refined topic and auto-select it
    await base44.functions.invoke('generateTopics', {
      project_id: project.id,
      niche: customTopic.trim(),
      exact_topic: customTopic.trim(),
      tone,
      target_audience: targetAudience.trim() || undefined,
    });

    // Auto-select the top ranked topic
    const topics = await base44.entities.Topics.filter({ project_id: project.id });
    const sorted = topics.sort((a, b) => a.rank - b.rank);
    if (sorted.length > 0) {
      const best = sorted[0];
      await base44.entities.Topics.update(best.id, { is_selected: true });
      await base44.entities.Projects.update(project.id, {
        selected_topic_id: best.id,
        status: 'topic_selected',
        current_step: 1,
      });
      navigate(createPageUrl(`StoryDuration?project_id=${project.id}`));
    } else {
      navigate(createPageUrl(`StoryTopics?project_id=${project.id}`));
    }
  };

  // If no type selected, show type picker
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
                className={`cursor-pointer transition-all duration-200 border-2 ${type.bgColor} hover:shadow-lg group`}
                onClick={() => {
                  if (type.id === 'ugc') {
                    navigate(createPageUrl('UGCPipeline'));
                  } else if (type.id === 'repurpose') {
                    navigate(createPageUrl('ContentRepurpose'));
                  } else if (type.id === 'niche') {
                    navigate(createPageUrl('ResearchTerminal'));
                  } else if (type.id === 'audit') {
                    navigate(createPageUrl('ChannelAuditor'));
                  } else {
                    setSelectedType(type.id);
                  }
                }}
              >
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

  // Faceless video creation flow
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card
                className="cursor-pointer border-2 border-gray-200 hover:border-blue-400 hover:shadow-lg transition-all group"
                onClick={() => setMode('topic')}
              >
                <CardContent className="p-6 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto">
                    <Pencil className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-lg font-bold">I Have a Topic</h3>
                  <p className="text-sm text-gray-500">Enter your exact video topic and AI will refine it and continue the pipeline.</p>
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
            </div>
          </div>
        )}

        {/* Own topic flow */}
        {mode === 'topic' && (
          <Card className="w-full max-w-lg mx-auto">
            <CardHeader className="text-center">
              <Pencil className="w-10 h-10 text-blue-600 mx-auto mb-2" />
              <CardTitle className="text-2xl">Your Video Topic</CardTitle>
              <p className="text-gray-500 text-sm mt-1">Describe your exact video idea — AI will refine and optimize it</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="e.g. Why 90% of people fail at intermittent fasting — the hidden science nobody talks about"
                value={customTopic}
                onChange={e => setCustomTopic(e.target.value)}
                disabled={loading}
                className="text-base min-h-[100px]"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Tone</label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Target Audience <span className="text-gray-400">(optional)</span></label>
                  <Input
                    placeholder="e.g. young adults 18-25"
                    value={targetAudience}
                    onChange={e => setTargetAudience(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMode(null)} disabled={loading}>
                  Back
                </Button>
                <Button
                  onClick={handleCreateFromTopic}
                  disabled={!customTopic.trim() || loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  size="lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Refining & Creating...
                    </>
                  ) : (
                    'Create Project'
                  )}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Tone</label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Target Audience <span className="text-gray-400">(optional)</span></label>
                  <Input
                    placeholder="e.g. tech enthusiasts, parents"
                    value={targetAudience}
                    onChange={e => setTargetAudience(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMode(null)} disabled={loading}>
                  Back
                </Button>
                <Button
                  onClick={handleCreateFromNiche}
                  disabled={!niche.trim() || loading}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                  size="lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Generating Topics...
                    </>
                  ) : (
                    'Generate 5 Topic Ideas'
                  )}
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