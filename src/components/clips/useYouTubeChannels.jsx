import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Shared hook for YouTube channel connection state.
 * Used by ClipAutoPublish, ClipScheduler, and anywhere else that needs
 * to list/connect/disconnect YouTube channels via the `youtubeAuth` function.
 *
 * Mirrors the exact pattern used by Dashboard's YouTubePublishPanel.
 */
export function useYouTubeChannels() {
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('youtubeAuth', { action: 'list_channels' });
      const ch = res.data?.channels || [];
      const mapped = ch.map(c => ({
        id: c.channel_id,
        name: c.channel_name || 'YouTube Channel',
        thumbnail: c.channel_thumbnail,
        tokenValid: c.token_valid,
        isDefault: c.is_default,
      }));
      setChannels(mapped);
      const def = mapped.find(c => c.isDefault) || mapped[0];
      if (def && !selectedChannelId) setSelectedChannelId(def.id);
    } catch (err) {
      console.error('[useYouTubeChannels] list failed:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedChannelId]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const res = await base44.functions.invoke('youtubeAuth', { action: 'get_auth_url' });
      const url = res.data?.auth_url;
      if (url) window.location.href = url;
    } catch (err) {
      console.error('[useYouTubeChannels] auth failed:', err);
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async (channelId) => {
    try {
      await base44.functions.invoke('youtubeAuth', { action: 'disconnect', channel_id: channelId });
      await load();
    } catch (err) {
      console.error('[useYouTubeChannels] disconnect failed:', err);
    }
  }, [load]);

  const getAccessToken = useCallback(async (channelId) => {
    const res = await base44.functions.invoke('youtubeAuth', { action: 'get_token', channel_id: channelId });
    const token = res.data?.access_token;
    if (!token) throw new Error(res.data?.error || 'Failed to get YouTube token — reconnect the channel');
    return token;
  }, []);

  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  return {
    channels,
    selectedChannelId,
    setSelectedChannelId,
    selectedChannel,
    loading,
    connecting,
    connect,
    disconnect,
    refresh: load,
    getAccessToken,
  };
}