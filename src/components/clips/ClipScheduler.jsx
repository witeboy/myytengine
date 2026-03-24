import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Calendar, Clock, ChevronLeft, ChevronRight,
  Flame, GripVertical, Youtube, Instagram, Music2,
  Shuffle, ArrowDown, Copy,
} from 'lucide-react';

const PLATFORMS = [
  { id: 'youtube_shorts', label: 'YT Shorts', icon: Youtube, color: 'text-red-500' },
  { id: 'tiktok', label: 'TikTok', icon: Music2, color: 'text-gray-900' },
  { id: 'instagram_reels', label: 'Reels', icon: Instagram, color: 'text-pink-500' },
];

const TIME_SLOTS = [
  { id: 'morning', label: 'Morning (8-10am)', hour: 9 },
  { id: 'afternoon', label: 'Afternoon (12-2pm)', hour: 13 },
  { id: 'evening', label: 'Evening (6-8pm)', hour: 19 },
  { id: 'night', label: 'Night (9-11pm)', hour: 21 },
];

function getDayName(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ClipScheduler({ clips, enhancements = {} }) {
  const [strategy, setStrategy] = useState('spread');   // spread | burst | custom
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1); // Start tomorrow
    return d;
  });
  const [platformFilter, setPlatformFilter] = useState('all');
  const [schedule, setSchedule] = useState([]);

  // ── Auto-generate schedule ────────────────────────────────
  const generateSchedule = () => {
    const sorted = [...clips].sort((a, b) => b.virality_score - a.virality_score);
    const newSchedule = [];

    sorted.forEach((clip, i) => {
      const enhancement = enhancements[i];
      const bestTime = enhancement?.seo?.best_post_time || 'evening';
      const timeSlot = TIME_SLOTS.find(t => t.id === bestTime) || TIME_SLOTS[2];

      let dayOffset;
      if (strategy === 'spread') {
        // One clip per day, spread across the week
        dayOffset = i;
      } else if (strategy === 'burst') {
        // 2-3 clips per day for first few days
        dayOffset = Math.floor(i / 3);
      } else {
        dayOffset = i;
      }

      const postDate = new Date(startDate);
      postDate.setDate(postDate.getDate() + dayOffset);
      postDate.setHours(timeSlot.hour, 0, 0, 0);

      // Stagger platforms — rotate per clip for maximum reach
      const platformOrder = ['youtube_shorts', 'tiktok', 'instagram_reels'];

      newSchedule.push({
        clipIndex: clips.indexOf(clip),
        clip,
        date: postDate,
        dayOffset,
        timeSlot: bestTime,
        platforms: platformOrder, // Post to all, stagger by 30min
        enhancement,
      });
    });

    setSchedule(newSchedule);
  };

  // Generate on first render
  useMemo(() => {
    if (clips.length > 0 && schedule.length === 0) {
      generateSchedule();
    }
  }, [clips]);

  // Group by day
  const dayGroups = useMemo(() => {
    const groups = {};
    schedule.forEach(item => {
      const key = item.date.toDateString();
      if (!groups[key]) groups[key] = { date: new Date(item.date), items: [] };
      groups[key].items.push(item);
    });
    return Object.values(groups).sort((a, b) => a.date - b.date);
  }, [schedule]);

  const totalDays = dayGroups.length;

  const copyScheduleText = () => {
    const text = dayGroups.map(group => {
      const dayLabel = `${getDayName(group.date)} ${formatDate(group.date)}`;
      const items = group.items.map(item =>
        `  ${TIME_SLOTS.find(t => t.id === item.timeSlot)?.label || item.timeSlot} — "${item.clip.title}" (Score: ${item.clip.virality_score})`
      ).join('\n');
      return `${dayLabel}\n${items}`;
    }).join('\n\n');

    navigator.clipboard.writeText(`CLIP POSTING SCHEDULE\n${'='.repeat(40)}\n\n${text}`);
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-900">Posting schedule</span>
          <Badge variant="outline" className="text-[10px]">
            {clips.length} clips → {totalDays} days
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Strategy picker */}
          <Select value={strategy} onValueChange={(v) => { setStrategy(v); setTimeout(generateSchedule, 0); }}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spread">Spread (1/day)</SelectItem>
              <SelectItem value="burst">Burst (3/day)</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={generateSchedule}>
            <Shuffle className="w-3 h-3" />
            Regenerate
          </Button>

          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={copyScheduleText}>
            <Copy className="w-3 h-3" />
            Copy schedule
          </Button>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-2">
        {dayGroups.map((group, gi) => (
          <div key={gi} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Day header */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-900">
                  {getDayName(group.date)}
                </span>
                <span className="text-xs text-gray-500">{formatDate(group.date)}</span>
                {gi === 0 && <Badge className="text-[9px] px-1.5 py-0 bg-blue-100 text-blue-700 border-blue-200">Tomorrow</Badge>}
              </div>
              <span className="text-[10px] text-gray-400">
                {group.items.length} clip{group.items.length > 1 ? 's' : ''}
              </span>
            </div>

            {/* Clips for this day */}
            <div className="divide-y divide-gray-100">
              {group.items.map((item, ii) => (
                <div key={ii} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                  <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 cursor-grab" />

                  {/* Time */}
                  <div className="flex items-center gap-1 text-[10px] text-gray-400 w-20 flex-shrink-0">
                    <Clock className="w-3 h-3" />
                    {TIME_SLOTS.find(t => t.id === item.timeSlot)?.label?.split(' ')[0] || item.timeSlot}
                  </div>

                  {/* Clip info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{item.clip.title}</p>
                    <p className="text-[10px] text-gray-400">{item.clip.duration.toFixed(0)}s · {item.clip.category?.replace('_', ' ')}</p>
                  </div>

                  {/* Virality */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Flame className={`w-3 h-3 ${item.clip.virality_score >= 80 ? 'text-red-500' : item.clip.virality_score >= 60 ? 'text-amber-500' : 'text-blue-500'}`} />
                    <span className="text-xs font-bold text-gray-700">{item.clip.virality_score}</span>
                  </div>

                  {/* Platforms */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {PLATFORMS.map(p => (
                      <p.icon key={p.id} className={`w-3.5 h-3.5 ${p.color} opacity-60`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{clips.length} clips total</span>
          <span>{totalDays} posting days</span>
          <span>Avg virality: {Math.round(clips.reduce((s, c) => s + c.virality_score, 0) / clips.length)}</span>
        </div>
        <p className="text-[10px] text-gray-400">
          Highest-scored clips post first for algorithmic momentum
        </p>
      </div>
    </div>
  );
}
