import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Calendar, Youtube, Loader2, CheckCircle,
  Link2, Unlink2, Send, RefreshCw, Globe,
  Lock, Eye, Play, Pause, LayoutList, LayoutGrid,
} from 'lucide-react';
import { useYouTubeChannels } from './useYouTubeChannels';
import SchedulerStats from './scheduler/SchedulerStats';
import SchedulerCalendar from './scheduler/SchedulerCalendar';
import ClipPreviewModal from './scheduler/ClipPreviewModal';
import DayPostsList from './scheduler/DayPostsList';

const TIME_SLOTS = [
  { id: 'morning', label: 'Morning', time: '9:00 AM' },
  { id: 'afternoon', label: 'Afternoon', time: '1:00 PM' },
  { id: 'evening', label: 'Evening', time: '7:00 PM' },
  { id: 'night', label: 'Night', time: '9:00 PM' },
];

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ClipScheduler({ clips, enhancements = {}, videoUrl = '' }) {
  // ── Schedule config ─────────────────────────────────────────
  const [strategy, setStrategy] = useState('spread');
  const [timeSlot, setTimeSlot] = useState('evening');
  const [privacy, setPrivacy] = useState('public');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });

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

  // ── BULK SCHEDULE ALL CLIPS ─────────────────────────────────
  const scheduleAllClips = async () => {
    if (!selectedChannel) return;
    setScheduling(true);

    try {
      const clipPayloads = clips.map((clip, i) => {
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
        time_slot: timeSlot,
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Strategy</label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="spread">1 clip/day</SelectItem>
                  <SelectItem value="burst">3 clips/day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Post time</label>
              <Select value={timeSlot} onValueChange={setTimeSlot}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label} ({t.time})</SelectItem>
                  ))}
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

          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
            <p className="font-medium">
              {clips.length} clips will be posted {strategy === 'spread' ? 'one per day' : '3 per day'} starting {formatDate(startDate)} at {TIME_SLOTS.find((t) => t.id === timeSlot)?.time}
            </p>
            <p className="text-blue-500 mt-0.5">
              Highest virality clips post first. Total: {strategy === 'spread' ? clips.length : Math.ceil(clips.length / 3)} days of content.
            </p>
          </div>

          <Button
            onClick={scheduleAllClips}
            disabled={scheduling || !selectedChannel || clips.length === 0}
            className="w-full h-11 text-sm bg-gray-900 hover:bg-gray-800 text-white gap-2"
          >
            {scheduling ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Scheduling {clips.length} clips…</>
            ) : (
              <><Send className="w-4 h-4" />Schedule all {clips.length} clips for auto-posting</>
            )}
          </Button>
        </div>
      )}

      {/* CALENDAR + STATS — always visible */}
      {scheduledPosts.length > 0 && <SchedulerStats posts={scheduledPosts} />}

      <>
          {viewMode === 'calendar' ? (
            <div className="grid md:grid-cols-5 gap-4">
              <div className="md:col-span-3">
                <SchedulerCalendar
                  posts={scheduledPosts}
                  onDayClick={setSelectedDate}
                  selectedDate={selectedDate}
                />
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