import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Calendar, Youtube, Loader2, CheckCircle,
  Link2, Unlink2, Send, RefreshCw, Globe,
  Lock, Eye, Play, Pause, LayoutList, LayoutGrid, Clock, Timer,
} from 'lucide-react';
import { useYouTubeChannels } from './useYouTubeChannels';
import SchedulerStats from './scheduler/SchedulerStats';
import SchedulerCalendar from './scheduler/SchedulerCalendar';
import ClipPreviewModal from './scheduler/ClipPreviewModal';
import DayPostsList from './scheduler/DayPostsList';
import ClipSelectionList from './scheduler/ClipSelectionList';

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime12h(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${period}`;
}

export default function ClipScheduler({ clips, enhancements = {}, videoUrl = '' }) {
  // ── Schedule config ─────────────────────────────────────────
  const [strategy, setStrategy] = useState('spread');
  const [startTime, setStartTime] = useState('19:00'); // any time of day HH:MM
  const [intervalMinutes, setIntervalMinutes] = useState(120); // min 45
  const [postsPerDay, setPostsPerDay] = useState(3); // only used in burst
  const [privacy, setPrivacy] = useState('public');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });

  // ── Clip selection — which clips the user wants to schedule ──
  const [selectedIndices, setSelectedIndices] = useState([]);
  useEffect(() => {
    // Default: select all clips initially
    setSelectedIndices(clips.map((_, i) => i));
  }, [clips.length]);

  const toggleClip = (i) => {
    setSelectedIndices((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort((a, b) => a - b)
    );
  };
  const toggleAllClips = () => {
    setSelectedIndices((prev) => (prev.length === clips.length ? [] : clips.map((_, i) => i)));
  };

  // ── YouTube channels ────────────────────────────────────────
  const {
    channels,
    selectedChannelId: selectedChannel,
    loading: loadingChannels,
    connecting,
    connect: connectChannel,
    disconnect: disconnectChannel,
  } = useYouTubeChannels();

  // ── Scheduled posts ─────────────────────────────────────────
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [scheduling, setScheduling] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);

  // ── View mode + selection ──────────────────────────────────
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'
  const [selectedDate, setSelectedDate] = useState(null);
  const [previewPost, setPreviewPost] = useState(null);

  // ── Poller state ────────────────────────────────────────────
  const [pollerActive, setPollerActive] = useState(false);
  const pollerRef = useRef(null);

  // ── Load on mount ───────────────────────────────────────────
  useEffect(() => {
    loadScheduledPosts();
    return () => { if (pollerRef.current) clearInterval(pollerRef.current); };
  }, []);

  const loadScheduledPosts = async () => {
    try {
      const res = await base44.functions.invoke('scheduleClipPost', { action: 'list' });
      const data = res.data || res;
      if (data?.posts?.length > 0) {
        setScheduledPosts(data.posts);
        setIsScheduled(true);
        // Auto-select earliest date with posts
        if (!selectedDate) {
          const earliest = data.posts
            .filter((p) => p.scheduled_at)
            .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0];
          if (earliest) setSelectedDate(new Date(earliest.scheduled_at));
        }
      }
    } catch (err) {
      console.error('Failed to load scheduled posts:', err);
    }
  };

  // ── BULK SCHEDULE SELECTED CLIPS ────────────────────────────
  const scheduleAllClips = async () => {
    if (!selectedChannel) return;
    if (selectedIndices.length === 0) return;
    setScheduling(true);

    try {
      // Only build payloads for selected clips, sorted by virality desc
      const chosen = selectedIndices
        .map((i) => ({ i, clip: clips[i] }))
        .sort((a, b) => (b.clip.virality_score || 0) - (a.clip.virality_score || 0));

      const clipPayloads = chosen.map(({ i, clip }) => {
        const enh = enhancements[i];
        const seo = enh?.seo || {};
        return {
          clip_data: clip,
          seo: {
            title: seo.title || clip.title || `Clip ${i + 1}`,
            description: seo.description || '',
            tags: seo.hashtags || [],
            hashtags: seo.hashtags || [],
          },
          platform: 'youtube_shorts',
          clip_url: clip.clip_url || '',
          virality_score: clip.virality_score || 0,
        };
      });

      const res = await base44.functions.invoke('scheduleClipPost', {
        action: 'bulk',
        clips: clipPayloads,
        channel_setting_id: selectedChannel,
        strategy,
        start_date: startDate,
        start_time: startTime,
        interval_minutes: Math.max(45, intervalMinutes),
        posts_per_day: postsPerDay,
        privacy,
        video_url: videoUrl,
      });

      const data = res.data || res;
      if (data?.success) {
        setIsScheduled(true);
        await loadScheduledPosts();
        startPoller();
      }
    } catch (err) {
      console.error('Bulk schedule failed:', err);
    } finally {
      setScheduling(false);
    }
  };

  // ── RESCHEDULE — moves a post to a new day, preserves time ──
  const reschedulePost = async (postId, newDate) => {
    const existing = scheduledPosts.find((p) => p.id === postId);
    if (!existing) return;

    const oldAt = new Date(existing.scheduled_at);
    const newAt = new Date(newDate);
    newAt.setHours(oldAt.getHours(), oldAt.getMinutes(), 0, 0);

    // Optimistic update
    setScheduledPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, scheduled_at: newAt.toISOString() } : p))
    );

    try {
      await base44.functions.invoke('scheduleClipPost', {
        action: 'reschedule',
        post_id: postId,
        scheduled_at: newAt.toISOString(),
      });
      await loadScheduledPosts();
    } catch (err) {
      console.error('Reschedule failed:', err);
      await loadScheduledPosts();
    }
  };

  // ── POLLER ──────────────────────────────────────────────────
  const startPoller = () => {
    if (pollerRef.current) clearInterval(pollerRef.current);
    setPollerActive(true);

    const poll = async () => {
      try {
        const res = await base44.functions.invoke('scheduleClipPost', { action: 'process' });
        const data = res.data || res;
        if (data?.processed > 0) {
          console.log(`⏰ Auto-published ${data.processed} clips`);
          await loadScheduledPosts();
        }
      } catch (err) {
        console.error('Poller error:', err);
      }
    };
    poll();
    pollerRef.current = setInterval(poll, 60000);
  };

  const stopPoller = () => {
    if (pollerRef.current) clearInterval(pollerRef.current);
    pollerRef.current = null;
    setPollerActive(false);
  };

  const cancelPost = async (postId) => {
    try {
      await base44.functions.invoke('scheduleClipPost', { action: 'cancel', post_id: postId });
      await loadScheduledPosts();
    } catch (err) {
      console.error('Cancel failed:', err);
    }
  };

  // ── Derived: posts for selected day ─────────────────────────
  const selectedDayPosts = useMemo(() => {
    if (!selectedDate) return [];
    const key = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`;
    return scheduledPosts.filter((p) => {
      if (!p.scheduled_at) return false;
      const d = new Date(p.scheduled_at);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === key;
    });
  }, [selectedDate, scheduledPosts]);

  // ── Derived: all days with posts (for list view) ────────────
  const allDayGroups = useMemo(() => {
    const groups = {};
    scheduledPosts.forEach((post) => {
      if (!post.scheduled_at) return;
      const d = new Date(post.scheduled_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!groups[key]) groups[key] = { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), items: [] };
      groups[key].items.push(post);
    });
    return Object.values(groups).sort((a, b) => a.date - b.date);
  }, [scheduledPosts]);

  return (
    <div className="space-y-4 border border-gray-200 rounded-xl p-5 bg-white">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-gray-700" />
          <h3 className="text-base font-semibold text-gray-900">Auto-post scheduler</h3>
          {isScheduled && (
            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
              {scheduledPosts.length} scheduled
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle — always visible */}
          <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-2 py-1 text-[10px] flex items-center gap-1 ${viewMode === 'calendar' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              <LayoutGrid className="w-3 h-3" /> Calendar
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-2 py-1 text-[10px] flex items-center gap-1 ${viewMode === 'list' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              <LayoutList className="w-3 h-3" /> List
            </button>
          </div>

          {isScheduled && (
            <>
              <div className={`flex items-center gap-1.5 text-xs ${pollerActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                <div className={`w-2 h-2 rounded-full ${pollerActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                {pollerActive ? 'Auto-posting active' : 'Paused'}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px] gap-1"
                onClick={pollerActive ? stopPoller : startPoller}
              >
                {pollerActive ? <><Pause className="w-3 h-3" />Pause</> : <><Play className="w-3 h-3" />Resume</>}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* YouTube channel connection */}
      <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
            <Youtube className="w-4 h-4 text-red-500" />
            Connected channel
          </span>
          {channels.length > 0 && selectedChannel && (
            <button
              onClick={() => disconnectChannel(selectedChannel)}
              className="text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-1"
            >
              <Unlink2 className="w-3 h-3" /> Disconnect
            </button>
          )}
        </div>

        {loadingChannels ? (
          <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        ) : channels.length > 0 ? (
          <div className="flex items-center gap-2 mt-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-700">{channels.find((c) => c.id === selectedChannel)?.name}</span>
            <span className="text-[10px] text-gray-400">— stays connected until you disconnect</span>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-8 text-xs gap-1.5 border-red-200 text-red-600 hover:bg-red-50 w-full"
            onClick={connectChannel}
            disabled={connecting}
          >
            {connecting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Connecting…</> : <><Link2 className="w-3.5 h-3.5" />Connect YouTube Channel</>}
          </Button>
        )}
      </div>

      {/* SCHEDULING CONFIG (pre-schedule) */}
      {!isScheduled && (
        <div className="space-y-3">
          {/* Row 1: Strategy + Start date + Privacy */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Strategy</label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="spread">1 clip/day</SelectItem>
                  <SelectItem value="burst">Multiple clips/day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Start date</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-xs mt-1" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Privacy</label>
              <Select value={privacy} onValueChange={setPrivacy}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public"><Globe className="w-3 h-3 inline mr-1" />Public</SelectItem>
                  <SelectItem value="unlisted"><Eye className="w-3 h-3 inline mr-1" />Unlisted</SelectItem>
                  <SelectItem value="private"><Lock className="w-3 h-3 inline mr-1" />Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Start time + Interval + (optional) posts per day */}
          <div className={`grid gap-3 ${strategy === 'burst' ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium flex items-center gap-1">
                <Clock className="w-3 h-3" /> First post time
              </label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-8 text-xs mt-1"
                step="300"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">{formatTime12h(startTime)}</p>
            </div>

            {strategy === 'burst' && (
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Clips per day</label>
                <Select value={String(postsPerDay)} onValueChange={(v) => setPostsPerDay(Number(v))}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 5, 6, 8].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n} per day</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className={strategy === 'burst' ? '' : ''}>
              <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium flex items-center gap-1">
                <Timer className="w-3 h-3" /> Interval between posts
              </label>
              <Select
                value={String(intervalMinutes)}
                onValueChange={(v) => setIntervalMinutes(Number(v))}
                disabled={strategy !== 'burst'}
              >
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="45">45 minutes (min)</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1h 30m</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                  <SelectItem value="180">3 hours</SelectItem>
                  <SelectItem value="240">4 hours</SelectItem>
                  <SelectItem value="360">6 hours</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {strategy === 'burst' ? 'Minimum 45 minutes apart' : 'Only used for multi-post days'}
              </p>
            </div>
          </div>

          {/* Clip selection */}
          {clips.length > 0 && (
            <ClipSelectionList
              clips={clips}
              selectedIndices={selectedIndices}
              onToggle={toggleClip}
              onToggleAll={toggleAllClips}
            />
          )}

          {/* Summary */}
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
            <p className="font-medium">
              {selectedIndices.length} selected clip{selectedIndices.length !== 1 ? 's' : ''} will start posting {formatDate(startDate)} at {formatTime12h(startTime)}
              {strategy === 'burst' && `, ${postsPerDay}/day at ${intervalMinutes}min intervals`}
              {strategy === 'spread' && ', one per day'}
            </p>
            <p className="text-blue-500 mt-0.5">
              Highest virality first · Total: {strategy === 'spread' ? selectedIndices.length : Math.ceil(selectedIndices.length / postsPerDay)} day{Math.ceil(selectedIndices.length / (strategy === 'spread' ? 1 : postsPerDay)) !== 1 ? 's' : ''} of content
            </p>
          </div>

          <Button
            onClick={scheduleAllClips}
            disabled={scheduling || !selectedChannel || selectedIndices.length === 0}
            className="w-full h-11 text-sm bg-gray-900 hover:bg-gray-800 text-white gap-2"
          >
            {scheduling ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Scheduling {selectedIndices.length} clips…</>
            ) : (
              <><Send className="w-4 h-4" />Schedule {selectedIndices.length} clip{selectedIndices.length !== 1 ? 's' : ''} for auto-posting</>
            )}
          </Button>
        </div>
      )}

      {/* CALENDAR + STATS — always visible */}
      {scheduledPosts.length > 0 && <SchedulerStats posts={scheduledPosts} />}

      <>
          {viewMode === 'calendar' ? (
            <div className="grid md:grid-cols-5 gap-4">
              <div className="md:col-span-3 space-y-2">
                <SchedulerCalendar
                  posts={scheduledPosts}
                  onDayClick={setSelectedDate}
                  selectedDate={selectedDate}
                  onPostDrop={reschedulePost}
                />
                {scheduledPosts.length > 0 && (
                  <p className="text-[10px] text-gray-400 text-center">
                    💡 Tip: Drag any scheduled clip from the side panel to a different day to reschedule it
                  </p>
                )}
              </div>
              <div className="md:col-span-2">
                {selectedDate && selectedDayPosts.length > 0 ? (
                  <DayPostsList
                    date={selectedDate}
                    posts={selectedDayPosts}
                    onPostClick={setPreviewPost}
                    onCancel={cancelPost}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center border border-dashed border-gray-200 rounded-lg p-6 text-center min-h-[300px]">
                    <div>
                      <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-xs text-gray-400">
                        {scheduledPosts.length === 0
                          ? 'No clips scheduled yet'
                          : selectedDate
                            ? 'No clips on this day'
                            : 'Click a day with clips to preview'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {allDayGroups.map((group) => (
                <DayPostsList
                  key={group.date.toISOString()}
                  date={group.date}
                  posts={group.items}
                  onPostClick={setPreviewPost}
                  onCancel={cancelPost}
                />
              ))}
            </div>
          )}

          <Button variant="outline" size="sm" className="w-full text-xs gap-1" onClick={loadScheduledPosts}>
            <RefreshCw className="w-3 h-3" /> Refresh status
          </Button>
        </>

      {/* Preview modal */}
      <ClipPreviewModal
        post={previewPost}
        open={!!previewPost}
        onClose={() => setPreviewPost(null)}
        onCancel={cancelPost}
      />
    </div>
  );
}