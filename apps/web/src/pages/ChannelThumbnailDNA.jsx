import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ChannelThumbnailDNAPanel from '@/components/channels/ChannelThumbnailDNAPanel';

export default function ChannelThumbnailDNAPage() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const channelId = params.get('channel_id');
      const list = await base44.entities.Channels.list('-created_date', 100);
      setChannels(list);
      if (channelId) setSelected(list.find(c => c.id === channelId) || list[0] || null);
      else setSelected(list[0] || null);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-screen"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  if (channels.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-xl font-bold mb-2">Channel Thumbnail DNA</h1>
        <p className="text-sm text-gray-600">No channels yet. Create a channel first.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Channel Thumbnail DNA</h1>
          <p className="text-xs text-gray-600">Lock brand assets that get injected into every thumbnail for this channel.</p>
        </div>
        <Link to="/ChannelsHub">
          <Button variant="outline" size="sm" className="gap-1"><ArrowLeft className="w-3 h-3" /> Channels</Button>
        </Link>
      </div>

      {/* Channel picker */}
      <div className="flex flex-wrap gap-1.5">
        {channels.map(c => (
          <button
            key={c.id}
            onClick={() => setSelected(c)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              selected?.id === c.id
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
            }`}
          >
            {c.icon_emoji || '📺'} {c.name}
          </button>
        ))}
      </div>

      {selected && <ChannelThumbnailDNAPanel channel_id={selected.id} channel_name={selected.name} />}
    </div>
  );
}