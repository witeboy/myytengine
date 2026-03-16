import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';
import { Plus, Wrench, FolderOpen, Search, Tv } from 'lucide-react';
import NicheCard from '@/components/channels/NicheCard';
import CreateChannelDialog from '@/components/channels/CreateChannelDialog';

export default function ChannelsHub() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: () => base44.entities.Channels.filter({ status: 'active' }, '-created_date'),
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                <Tv className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Content Factory</h1>
                <p className="text-gray-500 text-sm">Multi-channel YouTube content pipeline</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => navigate(createPageUrl('ToolsHub'))} className="text-xs">
              <Wrench className="w-4 h-4 mr-1" /> Tools
            </Button>
            <Button variant="outline" onClick={() => navigate(createPageUrl('MediaLibrary'))} className="text-xs">
              <FolderOpen className="w-4 h-4 mr-1" /> Media
            </Button>
            <Button variant="outline" onClick={() => navigate(createPageUrl('ResearchTerminal'))} className="text-xs">
              <Search className="w-4 h-4 mr-1" /> Research
            </Button>
            <Button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-1" /> New Channel
            </Button>
          </div>
        </div>

        {/* Stats Bar */}
        {channels.length > 0 && (
          <div className="flex flex-wrap gap-4 mb-6 text-sm">
            <Badge variant="outline" className="px-3 py-1.5 text-xs">
              {channels.length} Active Channel{channels.length !== 1 ? 's' : ''}
            </Badge>
            <Badge variant="outline" className="px-3 py-1.5 text-xs">
              {channels.reduce((s, c) => s + (c.total_topics || 0), 0)} Total Topics
            </Badge>
            <Badge variant="outline" className="px-3 py-1.5 text-xs">
              {channels.reduce((s, c) => s + (c.topics_scheduled || 0), 0)} Scheduled
            </Badge>
          </div>
        )}

        {/* Channel Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-xl h-40 animate-pulse border" />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-200">
            <div className="text-5xl mb-4">📺</div>
            <h2 className="text-xl font-bold text-gray-700 mb-2">No channels yet</h2>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Create your first YouTube channel to start building content at scale. Each channel has its own niche, posting calendar, and content pipeline.
            </p>
            <Button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-1" /> Create Your First Channel
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {channels.map(channel => (
              <NicheCard
                key={channel.id}
                channel={channel}
                onClick={() => navigate(createPageUrl(`ChannelDetail?channel_id=${channel.id}`))}
              />
            ))}
            {/* Add channel card */}
            <button
              onClick={() => setShowCreate(true)}
              className="min-h-[140px] rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 transition-all flex flex-col items-center justify-center text-gray-400 hover:text-blue-500"
            >
              <Plus className="w-8 h-8 mb-1" />
              <span className="text-sm font-medium">Add Channel</span>
            </button>
          </div>
        )}
      </div>

      <CreateChannelDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['channels'] })}
      />
    </div>
  );
}