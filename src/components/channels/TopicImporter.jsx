import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Upload, FileText, Sparkles, AlertTriangle, Trash2, Check } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function TopicImporter({ open, onOpenChange, channel, onImported }) {
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [phase, setPhase] = useState('');
  const [duplicates, setDuplicates] = useState(null); // { matches: [{new_title, existing_title, existing_id, similarity}], unique: [string] }
  const [selectedDupes, setSelectedDupes] = useState(new Set()); // indices of dupes to delete
  const [step, setStep] = useState('input'); // 'input' | 'review' | 'importing'

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

  const checkDuplicates = async () => {
    const titles = parseTopics(text);
    if (titles.length === 0) return;

    setImporting(true);
    setPhase('Checking for duplicates...');

    // Fetch existing topics for this channel
    const existingTopics = await base44.entities.ChannelTopics.filter({ channel_id: channel.id });
    const existingTitles = existingTopics.map(t => ({ id: t.id, title: t.title }));

    if (existingTitles.length === 0) {
      // No existing topics — skip duplicate check, go straight to import
      setDuplicates({ matches: [], unique: titles });
      setImporting(false);
      setPhase('');
      await doImport(titles);
      return;
    }

    // Use AI to find duplicates: both within new list AND against existing
    setPhase('AI is scanning for duplicates...');
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a strict duplicate detector for YouTube video topics. You must perform TWO checks:

CHECK 1 — DUPLICATES WITHIN THE NEW IMPORT LIST:
Compare all new topics against each other. 
- If two new topics are word-for-word identical OR ~80%+ verbatim the same → mark as "auto_remove" (the second/later one gets removed automatically).
- If two new topics cover the same idea but with different wording (less than 80% verbatim) → mark as "internal_flag" so user can decide.

CHECK 2 — DUPLICATES AGAINST EXISTING CHANNEL TOPICS:
Compare each remaining new topic against existing topics.
- If a new topic is word-for-word identical OR ~80%+ verbatim the same as an existing → mark as "auto_remove_existing".
- If a new topic covers the same idea as an existing but with different wording → mark as "flag_existing" so user can decide.

EXISTING TOPICS in this channel:
${existingTitles.length > 0 ? existingTitles.map((t, i) => `${i + 1}. "${t.title}" (id: ${t.id})`).join('\n') : '(none)'}

NEW TOPICS being imported (in order):
${titles.map((t, i) => `${i + 1}. "${t}"`).join('\n')}

IMPORTANT: Topics about different aspects of the same broad niche are NOT duplicates. Only flag truly redundant topics.

Return JSON:
{
  "auto_removed_internal": [{"kept": "title kept", "removed": "title auto-removed", "reason": "why"}],
  "auto_removed_existing": [{"new_title": "...", "existing_title": "...", "existing_id": "...", "reason": "why"}],
  "flagged_existing": [{"new_title": "...", "existing_title": "...", "existing_id": "...", "reason": "why"}],
  "flagged_internal": [{"title_a": "...", "title_b": "...", "reason": "why"}],
  "unique": ["list of new titles that passed all checks and are not auto-removed"]
}`,
      response_json_schema: {
        type: "object",
        properties: {
          auto_removed_internal: {
            type: "array",
            items: { type: "object", properties: { kept: { type: "string" }, removed: { type: "string" }, reason: { type: "string" } } }
          },
          auto_removed_existing: {
            type: "array",
            items: { type: "object", properties: { new_title: { type: "string" }, existing_title: { type: "string" }, existing_id: { type: "string" }, reason: { type: "string" } } }
          },
          flagged_existing: {
            type: "array",
            items: { type: "object", properties: { new_title: { type: "string" }, existing_title: { type: "string" }, existing_id: { type: "string" }, reason: { type: "string" } } }
          },
          flagged_internal: {
            type: "array",
            items: { type: "object", properties: { title_a: { type: "string" }, title_b: { type: "string" }, reason: { type: "string" } } }
          },
          unique: { type: "array", items: { type: "string" } }
        }
      }
    });

    setImporting(false);
    setPhase('');

    const autoInternal = result.auto_removed_internal || [];
    const autoExisting = result.auto_removed_existing || [];
    const flaggedExisting = result.flagged_existing || [];
    const flaggedInternal = result.flagged_internal || [];
    const unique = result.unique || [];

    const hasFlags = flaggedExisting.length > 0 || flaggedInternal.length > 0;
    const hasAutoRemoved = autoInternal.length > 0 || autoExisting.length > 0;

    if (hasFlags || hasAutoRemoved) {
      setDuplicates({ autoInternal, autoExisting, flaggedExisting, flaggedInternal, unique });
      // Pre-select all flagged for deletion by default
      const allFlags = [
        ...flaggedExisting.map((_, i) => `existing_${i}`),
        ...flaggedInternal.map((_, i) => `internal_${i}`),
      ];
      setSelectedDupes(new Set(allFlags));
      setStep('review');
    } else {
      await doImport(unique.length > 0 ? unique : titles);
    }
  };

  const handleConfirmReview = async () => {
    setStep('importing');
    setImporting(true);

    // Delete selected duplicates from existing topics
    if (selectedDupes.size > 0) {
      setPhase('Removing duplicate existing topics...');
      for (const idx of selectedDupes) {
        const match = duplicates.matches[idx];
        if (match?.existing_id) {
          await base44.entities.ChannelTopics.delete(match.existing_id);
        }
      }
    }

    // Build final list: unique topics + all new topics (including the ones whose old dupes we deleted)
    const titlesToImport = [
      ...duplicates.unique,
      ...duplicates.matches.map(m => m.new_title),
    ];

    // Remove new topics that the user chose to KEEP the existing version of (unselected dupes)
    const skippedNewTitles = new Set();
    duplicates.matches.forEach((m, i) => {
      if (!selectedDupes.has(i)) {
        skippedNewTitles.add(m.new_title);
      }
    });

    const finalTitles = titlesToImport.filter(t => !skippedNewTitles.has(t));

    await doImport(finalTitles);
  };

  const doImport = async (titles) => {
    if (titles.length === 0) {
      resetState();
      onOpenChange(false);
      onImported?.(0);
      return;
    }

    setImporting(true);
    setPhase('Importing topics...');
    const topicData = titles.map((title, i) => ({
      channel_id: channel.id,
      title,
      format: 'short',
      status: 'queued',
      priority: i,
    }));

    await base44.entities.ChannelTopics.bulkCreate(topicData);

    const existing = channel.total_topics || 0;
    await base44.entities.Channels.update(channel.id, {
      total_topics: existing + titles.length,
    });

    setPhase('AI is analyzing topics and assigning formats...');
    await base44.functions.invoke('parseAndScheduleTopics', {
      channel_id: channel.id,
    }).catch((err) => console.warn('Scheduling error:', err));

    resetState();
    onOpenChange(false);
    onImported?.(titles.length);
  };

  const resetState = () => {
    setImporting(false);
    setPhase('');
    setText('');
    setDuplicates(null);
    setSelectedDupes(new Set());
    setStep('input');
  };

  const toggleDupe = (idx) => {
    setSelectedDupes(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const parsedCount = parseTopics(text).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!importing) { if (!v) resetState(); onOpenChange(v); } }}>
      <DialogContent className="sm:max-w-lg">
        {step === 'input' && (
          <>
            <DialogHeader>
              <DialogTitle>Import Topics — {channel?.name}</DialogTitle>
              <DialogDescription>Paste or upload topics. AI will check for duplicates and assign formats.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 flex gap-2">
                <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-0.5">AI-Powered Import</p>
                  <p>Paste topics — AI will detect duplicates, assign formats, and schedule them.</p>
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
                  placeholder="How to build wealth in your 20s&#10;The psychology of money&#10;5 investments that made millionaires&#10;..."
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
              <Button variant="outline" onClick={() => { resetState(); onOpenChange(false); }} disabled={importing}>Cancel</Button>
              <Button
                onClick={checkDuplicates}
                disabled={importing || parsedCount === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                Import {parsedCount} Topics
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'review' && duplicates && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Duplicates Found
              </DialogTitle>
              <DialogDescription>
                AI found {duplicates.matches.length} topic{duplicates.matches.length > 1 ? 's' : ''} that already exist. Select which existing duplicates to delete and replace with the new version.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[350px] pr-2">
              <div className="space-y-2 py-2">
                {duplicates.matches.map((m, i) => (
                  <div
                    key={i}
                    className={`border rounded-lg p-3 transition-colors cursor-pointer ${
                      selectedDupes.has(i) ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
                    }`}
                    onClick={() => toggleDupe(i)}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={selectedDupes.has(i)}
                        onCheckedChange={() => toggleDupe(i)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900">New: "{m.new_title}"</p>
                        <p className="text-xs text-gray-500 mt-0.5">Existing: "{m.existing_title}"</p>
                        <p className="text-[10px] text-amber-600 mt-1">{m.reason}</p>
                      </div>
                      {selectedDupes.has(i) && <Trash2 className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
              <p><span className="font-semibold text-green-700">{duplicates.unique.length}</span> unique topics will be imported</p>
              <p><span className="font-semibold text-red-600">{selectedDupes.size}</span> existing duplicates will be deleted & replaced</p>
              <p><span className="font-semibold text-gray-500">{duplicates.matches.length - selectedDupes.size}</span> new duplicates will be skipped (keeping existing)</p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setStep('input'); setDuplicates(null); }}>Back</Button>
              <Button
                onClick={handleConfirmReview}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Check className="w-4 h-4 mr-1" />
                Confirm & Import
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'importing' && (
          <>
            <DialogHeader>
              <DialogTitle>Importing...</DialogTitle>
            </DialogHeader>
            <div className="py-6">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 flex items-center gap-3 text-sm text-purple-700">
                <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
                <span>{phase || 'Processing...'}</span>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}