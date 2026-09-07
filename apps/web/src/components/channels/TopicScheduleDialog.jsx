import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar as CalendarIcon, Clock, Loader2, X } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// TopicScheduleDialog
// Lets a user set/change the publish date+time for a ChannelTopic.
// Uses the user's local timezone and stores:
//   scheduled_date (YYYY-MM-DD)
//   scheduled_time (HH:MM, 24h)
//   scheduled_timezone (IANA, e.g. America/New_York)
// Auto-sets status to 'scheduled' when a date is saved.
// ══════════════════════════════════════════════════════════════════
export default function TopicScheduleDialog({ open, onOpenChange, topic, onSaved }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    if (open && topic) {
      setDate(topic.scheduled_date || '');
      setTime(topic.scheduled_time || '');
      setError('');
    }
  }, [open, topic]);

  const handleSave = async () => {
    if (!date) { setError('Pick a date'); return; }
    if (!time) { setError('Pick a time'); return; }

    // Validate future
    const combined = new Date(`${date}T${time}`);
    if (isNaN(combined.getTime())) { setError('Invalid date/time'); return; }
    if (combined.getTime() < Date.now()) { setError('Time must be in the future'); return; }

    setSaving(true);
    try {
      await base44.entities.ChannelTopics.update(topic.id, {
        scheduled_date: date,
        scheduled_time: time,
        scheduled_timezone: userTimezone,
        status: topic.status === 'queued' ? 'scheduled' : topic.status,
      });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setError(e.message || 'Failed to save');
    }
    setSaving(false);
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await base44.entities.ChannelTopics.update(topic.id, {
        scheduled_date: '',
        scheduled_time: '',
        scheduled_timezone: '',
        status: topic.status === 'scheduled' ? 'queued' : topic.status,
      });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setError(e.message || 'Failed to clear');
    }
    setSaving(false);
  };

  const minDate = new Date().toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-blue-600" /> Schedule Publish
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
            <p className="text-[11px] text-gray-500 uppercase tracking-wide">Topic</p>
            <p className="text-sm font-medium text-gray-900 truncate">{topic?.title}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                <CalendarIcon className="w-3 h-3" /> Date
              </label>
              <Input
                type="date"
                value={date}
                min={minDate}
                onChange={e => { setDate(e.target.value); setError(''); }}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Time
              </label>
              <Input
                type="time"
                value={time}
                onChange={e => { setTime(e.target.value); setError(''); }}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="text-[11px] text-gray-500">
            Timezone: <span className="font-mono">{userTimezone}</span>
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {(topic?.scheduled_date || topic?.scheduled_time) && (
            <Button variant="outline" onClick={handleClear} disabled={saving} className="text-red-600 border-red-200 hover:bg-red-50">
              <X className="w-3.5 h-3.5 mr-1" /> Clear schedule
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CalendarIcon className="w-3.5 h-3.5 mr-1" />}
            Save Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}