import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Youtube, Plus, Trash2, Star, Loader2, AlertCircle, Settings } from 'lucide-react';

export default function YouTubeChannelSelector({ selectedChannelId, onChannelChange }) {
  const [channels, setChannels] = useState([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => { loadChannels(); }, []);

  const loadChannels = async () => {
    setLoadingChannels(true);
    try {
      const res = await base44.functions.invoke('youtubeAuth', { action: 'list_channels' });
      const ch = res.data?.channels || [];
      setChannels(ch);
      if (!selectedChannelId) {
        const def = ch.find(c => c.is_default) || ch[0];
        if (def) onChannelChange(def.channel_id);
      }
    } catch (err) { console.warn('Failed to load channels:', err.message); }
    setLoadingChannels(false);
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await base44.functions.invoke('youtubeAuth', { action: 'get_auth_url' });
      if (res.data?.auth_url) window.location.href = res.data.auth_url;
    } catch (err) { console.warn('Failed to get auth URL:', err.message); }
    setConnecting(false);
  };

  const handleDisconnect = async (chId) => {
    await base44.functions.invoke('youtubeAuth', { action: 'disconnect', channel_id: chId });
    await loadChannels();
  };

  const handleSetDefault = async (chId) => {
    await base44.functions.invoke('youtubeAuth', { action: 'set_default', channel_id: chId });
    await loadChannels();
  };

  const selectedChannel = channels.find(c => c.channel_id === selectedChannelId);

  if (loadingChannels) {
    return <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading channels...</div>;
  }

  if (channels.length === 0) {
    return (
      <Button onClick={handleConnect} disabled={connecting} className="w-full bg-red-600 hover:bg-red-700 gap-2">
        {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />}
        Connect YouTube Channel
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">YouTube Channel</label>
        <button onClick={() => setShowSettings(!showSettings)} className="text-gray-400 hover:text-gray-600"><Settings className="w-3.5 h-3.5" /></button>
      </div>
      <div className="flex gap-2">
        <Select value={selectedChannelId} onValueChange={onChannelChange}>
          <SelectTrigger className="flex-1 h-10"><SelectValue placeholder="Select channel" /></SelectTrigger>
          <SelectContent>
            {channels.map(ch => (
              <SelectItem key={ch.channel_id} value={ch.channel_id}>
                <div className="flex items-center gap-2">
                  {ch.channel_thumbnail && <img src={ch.channel_thumbnail} className="w-5 h-5 rounded-full" alt="" />}
                  <span>{ch.channel_name}</span>
                  {ch.is_default && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                  {!ch.token_valid && <AlertCircle className="w-3 h-3 text-red-500" />}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleConnect} variant="outline" size="icon" className="h-10 w-10" title="Add channel"><Plus className="w-4 h-4" /></Button>
      </div>

      {showSettings && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-gray-600">Connected Channels</p>
          {channels.map(ch => (
            <div key={ch.channel_id} className="flex items-center gap-2 p-2 bg-white rounded border">
              {ch.channel_thumbnail && <img src={ch.channel_thumbnail} className="w-6 h-6 rounded-full" alt="" />}
              <span className="flex-1 text-sm truncate">{ch.channel_name}</span>
              {ch.is_default && <Badge className="bg-amber-100 text-amber-700 text-[9px]">Default</Badge>}
              {!ch.token_valid && <Badge className="bg-red-100 text-red-700 text-[9px]">Expired</Badge>}
              <button onClick={() => handleSetDefault(ch.channel_id)} className="text-gray-400 hover:text-amber-500" title="Set default"><Star className="w-3.5 h-3.5" /></button>
              <button onClick={() => handleDisconnect(ch.channel_id)} className="text-gray-400 hover:text-red-500" title="Disconnect"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <Button onClick={handleConnect} variant="outline" size="sm" className="w-full gap-1.5 text-xs"><Plus className="w-3 h-3" /> Connect Another</Button>
        </div>
      )}

      {selectedChannel && !selectedChannel.token_valid && (
        <div className="flex items-center gap-2 p-2 bg-red-50 rounded text-xs text-red-700">
          <AlertCircle className="w-3.5 h-3.5" /><span>Token expired.</span>
          <Button onClick={handleConnect} size="sm" variant="outline" className="h-6 text-[10px] ml-auto border-red-300">Reconnect</Button>
        </div>
      )}
    </div>
  );
}