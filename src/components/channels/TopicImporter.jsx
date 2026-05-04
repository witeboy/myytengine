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

    const promptText = `You are a strict duplicate detector for YouTube video topics. You must perform TWO checks:

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

IMPORTANT: Topics about different aspects of the same broad niche are NOT duplicates. Only flag truly redundant topics.`;

    const apiKey = import.meta.env?.VITE_GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.REACT_APP_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("Gemini API Key is missing!");
      setImporting(false);
      setPhase('');
      return;
    }

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              temperature: 0.2, // Low temp for more deterministic duplicate checking
              responseMimeType: 'application/json',
              responseSchema: {
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
            },
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Gemini API Error ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }

      const data = await res.json();
      const rawAiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const result = JSON.parse(rawAiText);

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
    } catch (error) {
      console.error("Error checking duplicates:", error);
      setImporting(false);
      setPhase('');
    }
  };

  const handleConfirmReview = async () => {
    setStep('importing');
    setImporting(true);

    const d = duplicates;

    // 1. Delete selected existing-topic duplicates (flagged ones user confirmed)
    const existingIdsToDelete = [];
    d.flaggedExisting.forEach((m, i) => {
      if (selectedDupes.has(`existing_${i}`) && m.existing_id) {
        existingIdsToDelete.push(m.existing_id);
      }
    });
    // Also delete auto-removed existing matches
    d.autoExisting.forEach(m => {
      if (m.existing_id) existingIdsToDelete.push(m.existing_id);
    });

    if (existingIdsToDelete.length > 0) {
      setPhase(`Removing ${existingIdsToDelete.length} duplicate existing topics...`);
      for (const id of existingIdsToDelete) {
        await base44.entities.ChannelTopics.delete(id);
      }
    }

    // 2. Build final import list
    // Start with unique titles
    const finalTitles = [...d.unique];

    // Add flagged-existing new titles where user chose to delete existing (replace)
    d.flaggedExisting.forEach((m, i) => {
      if (selectedDupes.has(`existing_${i}`)) {
        finalTitles.push(m.new_title);
      }
      // If not selected, skip the new title (keep existing)
    });

    // Add auto-removed-existing new titles (old was auto-deleted, import new)
    d.autoExisting.forEach(m => finalTitles.push(m.new_title));

    // For internal flags: keep title_a, only add title_b if user selected to keep both
    d.flaggedInternal.forEach((m, i) => {
      if (!selectedDupes.has(`internal_${i}`)) {
        // User wants to keep both — add title_b if not already in list
        if (!finalTitles.includes(m.title_b)) finalTitles.push(m.title_b);
      }
      // If selected = remove title_b (it's already not in the list)
    });

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

  const toggleDupe = (key) => {
    setSelectedDupes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
                Duplicate Report
              </DialogTitle>
              <DialogDescription>
                Review duplicates below. Auto-removed items are already handled. Flagged items need your decision.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[400px] pr-2">
              <div className="space-y-3 py-2">
                {/* Auto-removed: internal verbatim dupes */}
                {duplicates.autoInternal.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> Auto-Removed (verbatim duplicates in your list)
                    </p>
                    {duplicates.autoInternal.map((m, i) => (
                      <div key={`ai_${i}`} className="border border-red-200 bg-red-50/50 rounded-lg p-2.5 mb-1.5">
                        <p className="text-xs text-red-700 line-through">"{m.removed}"</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">Kept: "{m.kept}" — {m.reason}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Auto-removed: verbatim matches with existing */}
                {duplicates.autoExisting.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> Auto-Removed (verbatim match with existing)
                    </p>
                    {duplicates.autoExisting.map((m, i) => (
                      <div key={`ae_${i}`} className="border border-red-200 bg-red-50/50 rounded-lg p-2.5 mb-1.5">
                        <p className="text-xs text-red-700">New: "{m.new_title}" <span className="text-[10px]">→ replaces existing</span></p>
                        <p className="text-[10px] text-gray-500">Existing removed: "{m.existing_title}" — {m.reason}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Flagged: similar to existing — user decides */}
                {duplicates.flaggedExisting.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Similar to Existing — Your Call
                    </p>
                    <p className="text-[10px] text-gray-500 mb-2">Check = delete existing & import new. Uncheck = skip new topic.</p>
                    {duplicates.flaggedExisting.map((m, i) => {
                      const key = `existing_${i}`;
                      return (
                        <div
                          key={key}
                          className={`border rounded-lg p-2.5 mb-1.5 transition-colors cursor-pointer ${
                            selectedDupes.has(key) ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
                          }`}
                          onClick={() => toggleDupe(key)}
                        >
                          <div className="flex items-start gap-2">
                            <Checkbox checked={selectedDupes.has(key)} onCheckedChange={() => toggleDupe(key)} className="mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-900">New: "{m.new_title}"</p>
                              <p className="text-xs text-gray-500 mt-0.5">Existing: "{m.existing_title}"</p>
                              <p className="text-[10px] text-amber-600 mt-1">{m.reason}</p>
                            </div>
                            {selectedDupes.has(key) && <Trash2 className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Flagged: similar within import list — user decides */}
                {duplicates.flaggedInternal.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Similar Within Your List — Your Call
                    </p>
                    <p className="text-[10px] text-gray-500 mb-2">Check = remove second topic. Uncheck = keep both.</p>
                    {duplicates.flaggedInternal.map((m, i) => {
                      const key = `internal_${i}`;
                      return (
                        <div
                          key={key}
                          className={`border rounded-lg p-2.5 mb-1.5 transition-colors cursor-pointer ${
                            selectedDupes.has(key) ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-white'
                          }`}
                          onClick={() => toggleDupe(key)}
                        >
                          <div className="flex items-start gap-2">
                            <Checkbox checked={selectedDupes.has(key)} onCheckedChange={() => toggleDupe(key)} className="mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-900">A: "{m.title_a}" <span className="text-green-600">(kept)</span></p>
                              <p className="text-xs text-gray-500 mt-0.5">B: "{m.title_b}" {selectedDupes.has(key) ? <span className="text-red-500">(will remove)</span> : <span className="text-green-500">(keeping both)</span>}</p>
                              <p className="text-[10px] text-orange-600 mt-1">{m.reason}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
              <p><span className="font-semibold text-green-700">{duplicates.unique.length}</span> unique topics ready to import</p>
              {duplicates.autoInternal.length > 0 && (
                <p><span className="font-semibold text-red-600">{duplicates.autoInternal.length}</span> verbatim internal dupes auto-removed</p>
              )}
              {duplicates.autoExisting.length > 0 && (
                <p><span className="font-semibold text-red-600">{duplicates.autoExisting.length}</span> verbatim existing dupes auto-replaced</p>
              )}
              {duplicates.flaggedExisting.length > 0 && (
                <p><span className="font-semibold text-amber-600">
                  {[...selectedDupes].filter(k => k.startsWith('existing_')).length}/{duplicates.flaggedExisting.length}
                </span> similar existing topics marked for replacement</p>
              )}
              {duplicates.flaggedInternal.length > 0 && (
                <p><span className="font-semibold text-orange-600">
                  {[...selectedDupes].filter(k => k.startsWith('internal_')).length}/{duplicates.flaggedInternal.length}
                </span> similar internal topics marked for removal</p>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setStep('input'); setDuplicates(null); }}>Back</Button>
              <Button onClick={handleConfirmReview} className="bg-blue-600 hover:bg-blue-700">
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