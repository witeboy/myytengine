import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Upload, FileText, Sparkles } from 'lucide-react';

export default function TopicImporter({ open, onOpenChange, channel, onImported }) {
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [phase, setPhase] = useState('');

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText(ev.target.result || '');
    reader.readAsText(file);
  };

  const parseTopics = (raw) => {
    let lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 1 && lines[0].includes(',')) {
      lines = lines[0].split(',').map(l => l.trim()).filter(Boolean);
    }
    return lines.map(l => l.replace(/^\d+[\.\)\-]\s*/, '').trim()).filter(l => l.length > 2);
  };

  const handleImport = async () => {
    const titles = parseTopics(text);
    if (titles.length === 0) return;

    setImporting(true);

    // Step 1: Create topics without format — AI will assign format during scheduling
    setPhase('Importing topics...');
    const topicData = titles.map((title, i) => ({
      channel_id: channel.id,
      title,
      format: 'short', // temporary default, AI will reassign
      status: 'queued',
      priority: i,
    }));

    await base44.entities.ChannelTopics.bulkCreate(topicData);

    // Update channel topic count
    const existing = channel.total_topics || 0;
    await base44.entities.Channels.update(channel.id, {
      total_topics: existing + titles.length,
    });

    // Step 2: AI classifies & schedules
    setPhase('AI is analyzing topics and assigning formats...');
    await base44.functions.invoke('parseAndScheduleTopics', {
      channel_id: channel.id,
    }).catch((err) => console.warn('Scheduling error:', err));

    setImporting(false);
    setPhase('');
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
          <DialogDescription>Paste or upload topics. AI will assign formats and schedule them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 flex gap-2">
            <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-0.5">AI-Powered Format Assignment</p>
              <p>Just paste all your topics — AI will intelligently assign which should be short-form and which should be long-form to maximize authority, viewership, and audience retention.</p>
            </div>
          </div>

          <div>
            <Label>Upload CSV or Text File</Label>
            <div className="mt-1">
              <label className="flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg cursor-pointer hover:bg-gray-50 text-sm text-gray-500">
                <Upload className="w-4 h-4" />
                Choose file...
                <input type="file" accept=".csv,.txt,.text" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>

          <div>
            <Label>Or paste topics (one per line)</Label>
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="How to build wealth in your 20s&#10;The psychology of money&#10;5 investments that made millionaires&#10;Why most people retire broke&#10;Day in the life of a stock trader&#10;..."
              className="mt-1 min-h-[180px] text-sm"
            />
            {parsedCount > 0 && (
              <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                <FileText className="w-3 h-3" /> {parsedCount} topics detected
              </p>
            )}
          </div>

          {importing && phase && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex items-center gap-2 text-xs text-purple-700">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              <span>{phase}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
          <Button
            onClick={handleImport}
            disabled={importing || parsedCount === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
            Import {parsedCount} Topics
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}