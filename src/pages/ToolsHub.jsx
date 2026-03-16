import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Users, RefreshCw, Shield, Film, Image, Search, FolderOpen } from 'lucide-react';

const tools = [
  { name: 'UGC Creator', desc: 'AI-powered user-generated content pipeline', icon: Users, page: 'UGCPipeline', color: '#8B5CF6' },
  { name: 'Content Repurpose', desc: 'Repurpose existing content into new formats', icon: RefreshCw, page: 'ContentRepurpose', color: '#3B82F6' },
  { name: 'Channel Auditor', desc: 'Audit YouTube channels for optimization', icon: Shield, page: 'ChannelAuditor', color: '#10B981' },
  { name: 'Flow / Re-make', desc: 'Progression and remake video workflows', icon: Film, page: 'FlowRemake', color: '#F59E0B' },
  { name: 'Niche Research', desc: 'Research trending niches and profitability', icon: Search, page: 'ResearchTerminal', color: '#EC4899' },
  { name: 'Media Library', desc: 'Browse and manage all media assets', icon: FolderOpen, page: 'MediaLibrary', color: '#6366F1' },
  { name: 'Make Thumbnail', desc: 'AI thumbnail generation with templates', icon: Image, page: 'PostProduction', color: '#EF4444' },
];

export default function ToolsHub() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('ChannelsHub'))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Tools & Utilities</h1>
            <p className="text-gray-500 text-sm">Standalone tools for content creation</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tools.map(tool => (
            <Card
              key={tool.name}
              className="hover:shadow-lg transition-all cursor-pointer group hover:scale-[1.02] duration-200"
              onClick={() => navigate(createPageUrl(tool.page))}
            >
              <CardContent className="p-5">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${tool.color}15` }}
                >
                  <tool.icon className="w-5 h-5" style={{ color: tool.color }} />
                </div>
                <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors mb-1">{tool.name}</h3>
                <p className="text-xs text-gray-500">{tool.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}