import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createPageUrl } from '@/utils';
import { Loader2, Sparkles } from 'lucide-react';

export default function NewProject() {
  const navigate = useNavigate();
  const [niche, setNiche] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <Sparkles className="w-10 h-10 text-blue-600 mx-auto mb-2" />
          <CardTitle className="text-2xl">New Video Project</CardTitle>
          <p className="text-gray-500 text-sm mt-1">Enter your content niche to get started</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="e.g. True Crime, Tech Reviews, History..."
            value={niche}
            onChange={e => setNiche(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            disabled={loading}
            className="text-lg py-6"
          />
          <Button
            onClick={handleCreate}
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
    </div>
  );
}