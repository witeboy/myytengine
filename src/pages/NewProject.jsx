import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import StepProgress from '@/components/StepProgress';
import { createPageUrl } from '@/utils';

export default function NewProject() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [niche, setNiche] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const project = await base44.entities.Projects.create({
        name: niche,
        niche: niche,
        tone: 'cinematic',
        category: 'Documentary',
        posts_per_week: 2,
      });

      await base44.functions.invoke('generateTopics', {
        project_id: project.id,
        niche: niche,
      });

      await base44.functions.invoke('generateBrandIdentity', {
        project_id: project.id,
        niche: niche,
      });

      navigate(createPageUrl(`topic_selection?project_id=${project.id}`));
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StepProgress currentStep={0} />
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Start New YouTube Channel</CardTitle>
            <p className="text-sm text-gray-600 mt-2">What niche will your channel focus on?</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="niche">Content Niche *</Label>
                <Input
                  id="niche"
                  placeholder="e.g., true crime, unsolved mysteries, technology, history, paranormal..."
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  required
                  autoFocus
                  className="text-lg"
                />
                <p className="text-xs text-gray-500 mt-2">We'll generate 100+ trending topics for your niche</p>
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(createPageUrl('dashboard'))}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 flex-1"
                  disabled={isLoading || !niche.trim()}
                >
                  {isLoading ? 'Generating Topics...' : 'Generate Topics'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}