import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Calendar, Clock, ChevronLeft, ChevronRight,
  Flame, GripVertical, Youtube, Instagram, Music2,
  Shuffle, Copy, Loader2, CheckCircle, AlertCircle,
  Link2, Unlink2, Zap, Send, Trash2, RefreshCw, Globe,
  Lock, Eye, Play,
} from 'lucide-react';

const PLATFORMS = [
  { id: 'youtube_shorts', label: 'YT Shorts', icon: Youtube, color: 'text-red-500', bgColor: 'bg-red-50' },
  { id: 'tiktok', label: 'TikTok', icon: Music2, color: 'text-gray-900', bgColor: 'bg-gray-50' },
  { id: 'instagram_reels', label: 'Reels', icon: Instagram, color: 'text-pink-500', bgColor: 'bg-pink-50' },
];

const TIME_SLOTS = [
  { id: 'morning', label: 'Morning', time: '9:00 AM', hour: 9 },
  { id: 'afternoon', label: 'Afternoon', time: '1:00 PM', hour: 13 },
  { id: 'evening', label: 'Evening', time: '7:00 PM', hour: 19 },
  { id: 'night', label: 'Night', time: '9:00 PM', hour: 21 },
];

const STATUS_STYLES = {
  scheduled:    { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'Scheduled' },
  publishing:   { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Publishing…' },
  published:    { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Published' },
  failed:       { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Failed' },
  cancelled:    { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', label: 'Cancelled' },
  ready_to_post:{ bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', label: 'Ready' },
};

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function isOverdue(scheduledAt) {
  return new Date(scheduledAt) <= new Date();
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

  // ── YouTube channel ─────────────────────────────────────────
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // ── Scheduled posts ─────────────────────────────────────────
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [scheduling, setScheduling] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);

  // ── Poller state ────────────────────────────────────────────
  const [pollerActive, setPollerActive] = useState(false);
  const [lastPollResult, setLastPollResult] = useState(null);
  const pollerRef = useRef(null);

  // ── Load channels on mount ──────────────────────────────────
  useEffect(() => {
    loadChannels();
    // loadScheduledPosts(); // disabled until backend redeploys
    return () => {
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, []);

  const loadChannels = async () => {
    setLoadingChannels(true);
    try {
      const res = await base44.functions.invoke('youtubeAuth', { action: 'list_channels' });
      const data = res.data || res;
      if (data && data.channels && data.channels.length > 0) {
        setChannels(data.channels.map(c => ({
          id: c.channel_id,
          name: c.channel_name || 'YouTube Channel',
        })));
        const defaultCh = data.channels.find(c => c.is_default) || data.channels[0];
        setSelectedChannel(defaultCh.channel_id);
      }
    } catch (err) {
      // YouTube not connected yet — that's fine
    } finally {
      setLoadingChannels(false);
    }
  };

  const loadScheduledPosts = async () => {
    try {
      const res = await base44.functions.invoke('scheduleClipPost', { action: 'list' });
      const data = res.data || res;
      if (data?.posts?.length > 0) {
        setScheduledPosts(data.posts);
        setIsScheduled(true);
      }
    } catch (err) {
      console.error('Failed to load scheduled posts:', err);
    }
  };

  const connectChannel = async () => {
    setConnecting(true);
    try {
      const res = await base44.functions.invoke('youtubeAuth', { action: 'get_auth_url' });
      const data = res.data || res;
      if (data?.auth_url) {
        const authWindow = window.open(data.auth_url, 'youtube-auth', 'width=600,height=700');
        const poll = setInterval(async () => {
          if (authWindow?.closed) {
            clearInterval(poll);
            await loadChannels();
            setConnecting(false);
          }
        }, 1000);
        setTimeout(() => { clearInterval(poll); setConnecting(false); }, 120000);
      }
    } catch (err) {
      console.error('Auth failed:', err);
      setConnecting(false);
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
        // Auto-start poller
        startPoller();
      }
    } catch (err) {
      console.error('Bulk schedule failed:', err);
    } finally {
      setScheduling(false);
    }
  };

  // ── POLLER — checks every 60s for due posts ─────────────────
  const startPoller = () => {
    if (pollerRef.current) clearInterval(pollerRef.current);

    setPollerActive(true);

    const poll = async () => {
      try {
        const res = await base44.functions.invoke('scheduleClipPost', { action: 'process' });
        const data = res.data || res;
        setLastPollResult(data);

        if (data?.processed > 0) {
          console.log(`⏰ Auto-published ${data.processed} clips`);
          await loadScheduledPosts();
        }
      } catch (err) {
        console.error('Poller error:', err);
      }
    };

    // Poll immediately, then every 60 seconds
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

  // ── Group scheduled posts by day ────────────────────────────
  const dayGroups = useMemo(() => {
    const groups = {};
    scheduledPosts.forEach(post => {
      if (!post.scheduled_at) return;
      const key = new Date(post.scheduled_at).toDateString();
      if (!groups[key]) groups[key] = { date: new Date(post.scheduled_at), items: [] };
      groups[key].items.push(post);
    });
    return Object.values(groups).sort((a, b) => a.date - b.date);
  }, [scheduledPosts]);

  // Count by status
  const statusCounts = useMemo(() => {
    const counts = { scheduled: 0, publishing: 0, published: 0, failed: 0 };
    scheduledPosts.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });
    return counts;
  }, [scheduledPosts]);

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4 border border-gray-200 rounded-xl p-5 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-gray-700" />
          <h3 className="text-base font-semibold text-gray-900">Auto-post scheduler</h3>
          {isScheduled && (
            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
              {scheduledPosts.length} scheduled
            </Badge>
          )}
        </div>

        {/* Poller status */}
        {isScheduled && (
          <div className="flex items-center gap-2">
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
              {pollerActive ? <><Loader2 className="w-3 h-3 animate-spin" />Pause</> : <><Play className="w-3 h-3" />Resume</>}
            </Button>
          </div>
        )}
      </div>

      {/* YouTube Channel Connection */}
      <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
            <Youtube className="w-4 h-4 text-red-500" />
            Connected channel
          </span>
          {channels.length > 0 && (
            <button onClick={() => {}} className="text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-1">
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
            <span className="text-xs font-medium text-emerald-700">{channels.find(c => c.id === selectedChannel)?.name}</span>
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

      {/* ── SCHEDULING CONTROLS (before scheduling) ─────────── */}
      {!isScheduled && (
        <div className="space-y-3">
          {/* Config row */}
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
                  {TIME_SLOTS.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.label} ({t.time})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Start date</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-xs mt-1" />
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

          {/* Preview of schedule */}
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
            <p className="font-medium">
              {clips.length} clips will be posted {strategy === 'spread' ? 'one per day' : '3 per day'} starting {formatDate(startDate)} at {TIME_SLOTS.find(t => t.id === timeSlot)?.time}
            </p>
            <p className="text-blue-500 mt-0.5">
              Highest virality clips post first. Total: {strategy === 'spread' ? clips.length : Math.ceil(clips.length / 3)} days of content.
            </p>
          </div>

          {/* Schedule button */}
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

      {/* ── SCHEDULED POSTS LIST (after scheduling) ───────────── */}
      {isScheduled && dayGroups.length > 0 && (
        <div className="space-y-3">
          {/* Status summary */}
          <div className="flex gap-2">
            {Object.entries(statusCounts).filter(([_, c]) => c > 0).map(([status, count]) => {
              const style = STATUS_STYLES[status] || STATUS_STYLES.scheduled;
              return (
                <div key={status} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}>
                  {status === 'publishing' && <Loader2 className="w-3 h-3 animate-spin" />}
                  {status === 'published' && <CheckCircle className="w-3 h-3" />}
                  {status === 'failed' && <AlertCircle className="w-3 h-3" />}
                  {count} {style.label}
                </div>
              );
            })}
          </div>

          {/* Day-by-day timeline */}
          {dayGroups.map((group, gi) => (
            <div key={gi} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
                <span className="text-xs font-semibold text-gray-900">{formatDate(group.date)}</span>
                <span className="text-[10px] text-gray-400">{group.items.length} clip{group.items.length > 1 ? 's' : ''}</span>
              </div>

              <div className="divide-y divide-gray-100">
                {group.items.map((post, ii) => {
                  const statusStyle = STATUS_STYLES[post.status] || STATUS_STYLES.scheduled;

                  return (
                    <div key={ii} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                      {/* Time */}
                      <div className="flex items-center gap-1 text-[10px] text-gray-400 w-16 flex-shrink-0 font-mono">
                        <Clock className="w-3 h-3" />
                        {formatTime(post.scheduled_at)}
                      </div>

                      {/* Title */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">{post.seo_title}</p>
                        {post.published_url && (
                          <a href={post.published_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline">
                            {post.published_url}
                          </a>
                        )}
                        {post.error_message && post.status === 'failed' && (
                          <p className="text-[10px] text-red-500 mt-0.5">{post.error_message}</p>
                        )}
                      </div>

                      {/* Virality */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Flame className={`w-3 h-3 ${post.virality_score >= 80 ? 'text-red-500' : 'text-amber-500'}`} />
                        <span className="text-xs font-bold text-gray-700">{post.virality_score}</span>
                      </div>

                      {/* Status badge */}
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                        {post.status === 'publishing' && <Loader2 className="w-2.5 h-2.5 mr-0.5 animate-spin" />}
                        {statusStyle.label}
                      </Badge>

                      {/* Cancel button (only for scheduled) */}
                      {post.status === 'scheduled' && (
                        <button
                          onClick={() => cancelPost(post.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Refresh button */}
          <Button variant="outline" size="sm" className="w-full text-xs gap-1" onClick={loadScheduledPosts}>
            <RefreshCw className="w-3 h-3" /> Refresh status
          </Button>
        </div>
      )}
    </div>
  );
}