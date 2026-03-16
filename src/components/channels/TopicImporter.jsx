import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Upload, FileText } from 'lucide-react';

export default function TopicImporter({ open, onOpenChange, channel, onImported }) {
  const [text, setText] = useState('');
  const [format, setFormat] = useState('short');
  const [importing, setImporting] = useState(false);
  const [fileRef, setFileRef] = useState(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText(ev.target.result || '');
    reader.readAsText(file);
  };

  const parseTopics = (raw) => {
    // Split by newlines first, then by commas if single line
    let lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 1 && lines[0].includes(',')) {
      lines = lines[0].split(',').map(l => l.trim()).filter(Boolean);
    }
    // Remove numbering like "1. " or "1) "
    return lines.map(l => l.replace(/^\d+[\.\)\-]\s*/, '').trim()).filter(l => l.length > 2);
  };

  const handleImport = async () => {
    const titles = parseTopics(text);
    if (titles.length === 0) return;

    setImporting(true);

    // Create all topics
    const topicData = titles.map((title, i) => ({
      channel_id: channel.id,
      title,
      format,
      status: 'queued',
      priority: i,
    }));

    await base44.entities.ChannelTopics.bulkCreate(topicData);

    // Update channel topic count
    const existing = channel.total_topics || 0;
    await base44.entities.Channels.update(channel.id, {
      total_topics: existing + titles.length,
    });

    // Auto-schedule via backend
    base44.functions.invoke('parseAndScheduleTopics', {
      channel_id: channel.id,
    }).catch(() => {});

    setImporting(false);
    setText('');
    onOpenChange(false);
    onImported?.(titles.length);
  };

  const parsedCount = parseTopics(text).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Topics — {channel?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Content Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short-form (≤{channel?.short_form_word_limit || 200} words)</SelectItem>
                <SelectItem value="long">Long-form ({channel?.long_form_duration_minutes || 15} min)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Upload CSV or Text File</Label>
            <div className="mt-1">
              <label className="flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg cursor-pointer hover:bg-gray-50 text-sm text-gray-500">
                <Upload className="w-4 h-4" />
                Choose file...
                <input type="file" accept=".csv,.txt,.text" onChange={handleFileUpload} className="hidden" ref={setFileRef} />
              </label>
            </div>
          </div>

          <div>
            <Label>Or paste topics (one per line, or comma-separated)</Label>
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="How to build wealth in your 20s&#10;The psychology of money&#10;5 investments that made millionaires&#10;..."
              className="mt-1 min-h-[150px] text-sm"
            />
            {parsedCount > 0 && (
              <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                <FileText className="w-3 h-3" /> {parsedCount} topics detected
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleImport}
            disabled={importing || parsedCount === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Import {parsedCount} Topics
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}