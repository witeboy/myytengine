import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';
import { Loader2, Sparkles, Film, Users, RefreshCw, ArrowRight, ArrowLeft } from 'lucide-react';
import ProjectTemplates from '@/components/templates/ProjectTemplates';

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
];

export default function NewProject() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState(null);
  const [niche, setNiche] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateFaceless = async () => {
    if (!niche.trim()) return;
    setLoading(true);

    const project = await base44.entities.Projects.create({
      name: niche.trim(),
      niche: niche.trim(),
      tone: 'dramatic',
      status: 'created',
      current_step: 0,
    });

    await base44.functions.invoke('generateTopics', {
      project_id: project.id,
      niche: niche.trim(),
    });

    navigate(createPageUrl(`StoryTopics?project_id=${project.id}`));
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {PROJECT_TYPES.map(type => (
              <Card
                key={type.id}
                className={`cursor-pointer transition-all duration-200 border-2 ${type.bgColor} hover:shadow-lg group`}
                onClick={() => {
                  if (type.id === 'ugc') {
                    navigate(createPageUrl('UGCPipeline'));
                  } else if (type.id === 'repurpose') {
                    navigate(createPageUrl('ContentRepurpose'));
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
        <Button variant="ghost" onClick={() => setSelectedType(null)} className="gap-2 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to project types
        </Button>

        <Card className="w-full max-w-lg mx-auto">
          <CardHeader className="text-center">
            <Sparkles className="w-10 h-10 text-blue-600 mx-auto mb-2" />
            <CardTitle className="text-2xl">New Faceless Video</CardTitle>
            <p className="text-gray-500 text-sm mt-1">Enter your content niche to get started</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="e.g. True Crime, Tech Reviews, History..."
              value={niche}
              onChange={e => setNiche(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFaceless()}
              disabled={loading}
              className="text-lg py-6"
            />
            <Button
              onClick={handleCreateFaceless}
              disabled={!niche.trim() || loading}
              className="w-full bg-blue-600 hover:bg-blue-700"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Generating 10 Topics...
                </>
              ) : (
                'Create Project & Generate Topics'
              )}
            </Button>
          </CardContent>
        </Card>

        <div className="border-t pt-8">
          <ProjectTemplates />
        </div>
      </div>
    </div>
  );
}