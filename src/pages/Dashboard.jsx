import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: allProjects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Projects.list(),
  });

  const projects = allProjects.filter(p => !p.archived);

  const archiveMutation = useMutation({
    mutationFn: (projectId) => base44.entities.Projects.update(projectId, { archived: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const getProjectRoute = (project) => {
    const step = project.current_step || 1;
    const status = project.status;

    if (step === 1 || status === 'created' || status === 'topics_ready') {
      return `topic_selection?project_id=${project.id}`;
    } else if (step === 2 || status === 'topic_selected') {
      return `video_duration_setup?project_id=${project.id}`;
    } else if (step === 3 || status === 'outline_ready') {
      return `outline_generation?project_id=${project.id}`;
    } else if (step === 4 || status === 'scripting') {
      return `script_workshop?project_id=${project.id}`;
    } else if (step === 5 || status === 'hooks_ready') {
      return `hook_selection?project_id=${project.id}`;
    } else {
      return `topic_selection?project_id=${project.id}`;
    }
  };

  const statusColors = {
    created: 'bg-gray-100 text-gray-800',
    topics_ready: 'bg-blue-100 text-blue-800',
    topic_selected: 'bg-purple-100 text-purple-800',
    hooks_ready: 'bg-indigo-100 text-indigo-800',
    scripting: 'bg-orange-100 text-orange-800',
    production: 'bg-yellow-100 text-yellow-800',
    publish_ready: 'bg-green-100 text-green-800',
    published: 'bg-emerald-100 text-emerald-800',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Projects</h1>
            <p className="text-gray-600 mt-2">Manage your YouTube content pipeline</p>
          </div>
          <Button
            onClick={() => navigate(createPageUrl('NewProject'))}
            className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            New Project
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-lg h-64 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="hover:shadow-lg transition-shadow"
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={() => navigate(createPageUrl(getProjectRoute(project)))}
                    >
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                      <p className="text-sm text-gray-600 mt-1">{project.niche}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColors[project.status] || statusColors.created}>
                        {project.status?.replace(/_/g, ' ')}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Archive this project?')) {
                            archiveMutation.mutate(project.id);
                          }
                        }}
                        className="h-8 w-8 text-gray-500 hover:text-gray-700"
                      >
                        <Archive className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div
                    className="cursor-pointer"
                    onClick={() => navigate(createPageUrl(getProjectRoute(project)))}
                  >
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium">Progress</span>
                      <span className="text-sm text-gray-600">{project.current_step}/15</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${(project.current_step / 15) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 pt-2">
                    <span>{project.posts_per_week} posts/week</span>
                    <span>{new Date(project.updated_date).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && projects.length === 0 && (
          <Card className="text-center py-12">
            <p className="text-gray-600 mb-4">No projects yet. Create your first one!</p>
            <Button
              onClick={() => navigate(createPageUrl('NewProject'))}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Project
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}