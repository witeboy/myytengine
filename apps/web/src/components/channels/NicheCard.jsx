import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const NICHE_DEFAULTS = {
  technology: { emoji: '💻', color: '#3B82F6', label: 'Technology & IT' },
  finance: { emoji: '💰', color: '#10B981', label: 'Finance & Wealth' },
  true_crime: { emoji: '🔍', color: '#EF4444', label: 'True Crime' },
  travel: { emoji: '✈️', color: '#F59E0B', label: 'Travel & Vlog' },
  football: { emoji: '⚽', color: '#22C55E', label: 'Football Stories' },
  movies: { emoji: '🎬', color: '#8B5CF6', label: 'Movies & Reactions' },
  random_facts: { emoji: '🧠', color: '#EC4899', label: 'Random Facts' },
  sleep_stories: { emoji: '🌙', color: '#6366F1', label: 'Sleep Stories' },
  music: { emoji: '🎵', color: '#F97316', label: 'Music' },
  gaming: { emoji: '🎮', color: '#14B8A6', label: 'Gaming' },
  health: { emoji: '🏥', color: '#06B6D4', label: 'Health & Fitness' },
  education: { emoji: '📚', color: '#8B5CF6', label: 'Education' },
  food: { emoji: '🍔', color: '#F59E0B', label: 'Food & Cooking' },
  science: { emoji: '🔬', color: '#0EA5E9', label: 'Science' },
  history: { emoji: '🏛️', color: '#A16207', label: 'History' },
  motivation: { emoji: '🔥', color: '#DC2626', label: 'Motivation' },
  comedy: { emoji: '😂', color: '#FBBF24', label: 'Comedy' },
  news: { emoji: '📰', color: '#64748B', label: 'News & Current Affairs' },
  horror: { emoji: '👻', color: '#1F2937', label: 'Horror' },
  lifestyle: { emoji: '🌿', color: '#84CC16', label: 'Lifestyle' },
  meditation: { emoji: '🧘', color: '#7C3AED', label: 'Meditation & Study' },
  sleep: { emoji: '🌙', color: '#4F46E5', label: 'Sleep & Tranquility' },
};

export function getNicheDefaults(niche) {
  return NICHE_DEFAULTS[niche] || { emoji: '📺', color: '#6B7280', label: niche?.replace(/_/g, ' ') || 'General' };
}

export function getAllNiches() {
  return Object.entries(NICHE_DEFAULTS).map(([key, val]) => ({ key, ...val }));
}

export default function NicheCard({ channel, onClick }) {
  const defaults = getNicheDefaults(channel.niche);
  const emoji = channel.icon_emoji || defaults.emoji;
  const color = channel.color || defaults.color;
  const topicCount = channel.total_topics || 0;
  const scheduledCount = channel.topics_scheduled || 0;

  return (
    <Card
      className="hover:shadow-lg transition-all cursor-pointer group border-2 hover:scale-[1.02] duration-200"
      style={{ borderColor: `${color}30` }}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: `${color}15` }}
          >
            {emoji}
          </div>
          <Badge
            className="text-[10px]"
            style={{ backgroundColor: `${color}15`, color }}
          >
            {channel.status === 'active' ? '● Active' : channel.status}
          </Badge>
        </div>
        <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors text-base mb-0.5">
          {channel.name}
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          {channel.niche_label || defaults.label}
        </p>
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <span>{topicCount} topics</span>
          <span>·</span>
          <span>{scheduledCount} scheduled</span>
          <span>·</span>
          <span>{channel.shorts_per_day || 5}S/{channel.longform_per_week || 3}L</span>
        </div>
      </CardContent>
    </Card>
  );
}