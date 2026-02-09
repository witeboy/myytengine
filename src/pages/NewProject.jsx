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
  const [formData, setFormData] = useState({
    name: '',
    niche: '',
    tone: 'cinematic',
    category: '',
    posts_per_week: 2,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const project = await base44.entities.Projects.create(formData);

      await base44.functions.invoke('generateTopics', {
        project_id: project.id,
        niche: formData.niche,
      });

      await base44.functions.invoke('generateBrandIdentity', {
        project_id: project.id,
        niche: formData.niche,
      });

      navigate(createPageUrl(`topic_selection?project_id=${project.id}`));
    } catch (error) {
      alert('Error creating project: ' + error.message);
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
            <CardTitle className="text-2xl">Create New Project</CardTitle>
            <p className="text-sm text-gray-600 mt-2">Set up your YouTube channel configuration</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., True Crime Mysteries"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="niche">Content Niche</Label>
                <Input
                  id="niche"
                  placeholder="e.g., true crime, technology, history"
                  value={formData.niche}
                  onChange={(e) => setFormData({ ...formData, niche: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="tone">Tone</Label>
                <Select value={formData.tone} onValueChange={(v) => setFormData({ ...formData, tone: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cinematic">Cinematic</SelectItem>
                    <SelectItem value="investigative">Investigative</SelectItem>
                    <SelectItem value="inspirational">Inspirational</SelectItem>
                    <SelectItem value="sarcastic">Sarcastic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  placeholder="e.g., Documentary"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="posts_per_week">Posts per Week</Label>
                <Input
                  id="posts_per_week"
                  type="number"
                  min="1"
                  max="7"
                  value={formData.posts_per_week}
                  onChange={(e) => setFormData({ ...formData, posts_per_week: parseInt(e.target.value) })}
                  required
                />
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
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}