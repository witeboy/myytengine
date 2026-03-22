import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Loader2, CheckCircle, AlertCircle, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function YouTubeCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing'); // processing | success | error
  const [message, setMessage] = useState('Connecting your YouTube channel...');
  const [channel, setChannel] = useState(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setMessage(`Google authorization was denied: ${error}`);
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('No authorization code received from Google.');
      return;
    }

    // Exchange code for tokens
    const exchangeCode = async () => {
      try {
        const res = await base44.functions.invoke('youtubeAuth', {
          action: 'exchange_code',
          code,
        });

        if (res.data?.success && res.data?.channel) {
          setChannel(res.data.channel);
          setStatus('success');
          setMessage(`Connected: ${res.data.channel.channel_name}`);

          // Auto-redirect after 3 seconds
          setTimeout(() => {
            navigate(createPageUrl('PostProduction'));
          }, 3000);
        } else {
          setStatus('error');
          setMessage(res.data?.error || 'Failed to connect YouTube channel.');
        }
      } catch (err) {
        setStatus('error');
        setMessage(err?.response?.data?.error || err.message || 'Connection failed.');
      }
    };

    exchangeCode();
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center space-y-4">
        <Youtube className={`w-12 h-12 mx-auto ${status === 'success' ? 'text-red-600' : status === 'error' ? 'text-gray-400' : 'text-red-600 animate-pulse'}`} />

        {status === 'processing' && (
          <>
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-red-600" />
            <p className="text-gray-600">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-8 h-8 mx-auto text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Channel Connected!</h2>
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200 justify-center">
              {channel?.channel_thumbnail && (
                <img src={channel.channel_thumbnail} className="w-10 h-10 rounded-full" alt="" />
              )}
              <div className="text-left">
                <p className="font-medium text-sm">{channel?.channel_name}</p>
                <p className="text-xs text-gray-500">{channel?.subscriber_count} subscribers</p>
              </div>
            </div>
            <p className="text-sm text-gray-500">Redirecting to Post Production...</p>
            <Button onClick={() => navigate(createPageUrl('PostProduction'))} variant="outline" className="w-full">
              Go Now
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle className="w-8 h-8 mx-auto text-red-500" />
            <h2 className="text-lg font-semibold text-gray-900">Connection Failed</h2>
            <p className="text-sm text-red-600">{message}</p>
            <div className="flex gap-2">
              <Button onClick={() => navigate(createPageUrl('PostProduction'))} variant="outline" className="flex-1">
                Back to Post Production
              </Button>
              <Button onClick={() => window.location.reload()} className="flex-1 bg-red-600 hover:bg-red-700">
                Try Again
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
