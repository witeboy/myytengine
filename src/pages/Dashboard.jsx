import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import OverallStats from '@/components/dashboard/OverallStats';
import QuickShortcuts from '@/components/dashboard/QuickShortcuts';
import NicheStatsGrid from '@/components/dashboard/NicheStatsGrid';
import ViralTrendsPanel from '@/components/dashboard/ViralTrendsPanel';
import ActiveProjectsStrip from '@/components/dashboard/ActiveProjectsStrip';
import CloudExportsPanel from '@/components/dashboard/CloudExportsPanel';
import { Loader2, LayoutDashboard, Cloud } from 'lucide-react';
import HealthCheckButton from '@/components/HealthCheckButton';
import YouTubePublishPanel from '@/components/postprod/YouTubePublishPanel';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('dashboard');

  const { data: channels = [], isLoading: loadingCh } = useQuery({
    queryKey: ['dashboard-channels'],
    queryFn: () => base44.entities.Channels.filter({ status: 'active' }),
  });

  const { data: topics = [], isLoading: loadingTopics } = useQuery({
    queryKey: ['dashboard-topics'],
    queryFn: () => base44.entities.ChannelTopics.list('-created_date', 500),
  });

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['dashboard-projects'],
    queryFn: () => base44.entities.Projects.list('-created_date', 100),
  });

  const archiveMutation = useMutation({
    mutationFn: (id) => base44.entities.Projects.update(id, { archived: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard-projects'] }),
  });

  const isLoading = loadingCh || loadingTopics || loadingProjects;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">AI Video Engine</h1>
            <p className="text-gray-500 mt-1">Your faceless YouTube content command center</p>
          </div>
          <HealthCheckButton />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'dashboard'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('cloud')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'cloud'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Cloud className="w-4 h-4" />
            Cloud Exports
          </button>
          <button
            onClick={() => setActiveTab('publish')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'publish'
                ? 'bg-white text-red-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg>
            Publish
          </button>
        </div>

        {activeTab === 'publish' ? (
          <div className="max-w-2xl">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Quick Publish</h2>
              <p className="text-sm text-gray-500">Select a project, pick your video file, and publish directly to YouTube</p>
            </div>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Select Project</label>
              <select
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                onChange={(e) => {
                  const p = projects.find(p => p.id === e.target.value);
                  if (p) setActiveTab('publish');
                  document.getElementById('yt-publish-project')?.setAttribute('data-project-id', e.target.value);
                  document.getElementById('yt-publish-project')?.setAttribute('data-project-name', p?.name || '');
                }}
              >
                <option value="">Choose a project...</option>
                {projects.filter(p => !p.archived).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div id="yt-publish-project">
              <YouTubePublishPanel project={projects.find(p => !p.archived)} />
            </div>
          </div>
        ) : activeTab === 'cloud' ? (
          <CloudExportsPanel />
        ) : (
        <>
        {/* Quick Shortcuts */}
        <section>
          <QuickShortcuts />
        </section>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="text-gray-400">Loading dashboard...</span>
          </div>
        ) : (
          <>
            {/* Overall Stats */}
            <section>
              <OverallStats channels={channels} topics={topics} projects={projects} />
            </section>

            {/* Niche Channels Grid */}
            {channels.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Niches</h2>
                <NicheStatsGrid channels={channels} topics={topics} projects={projects} />
              </section>
            )}

            {/* Active Projects */}
            <section>
              <ActiveProjectsStrip projects={projects} onArchive={(id) => archiveMutation.mutate(id)} />
            </section>

            {/* Viral Trends */}
            <section>
              <ViralTrendsPanel channels={channels} />
            </section>
          </>
        )}
        </>
        )}
      </div>
    </div>
  );
}