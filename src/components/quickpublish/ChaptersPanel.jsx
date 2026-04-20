import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bookmark, Copy, Check, Plus } from 'lucide-react';

// ── Format seconds → YouTube chapter format (0:00, 1:23, 1:23:45) ────
function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Build YouTube chapters block (first chapter MUST be 0:00) ─────────
function buildChaptersText(chapters) {
  if (!chapters?.length) return '';
  // Dedupe & sort
  const sorted = [...chapters].sort((a, b) => a.start - b.start);
  // Force first to 0:00
  const lines = sorted.map((c, i) => {
    const t = i === 0 ? '0:00' : formatTime(c.start);
    const title = (c.headline || c.gist || 'Chapter').slice(0, 80);
    return `${t} ${title}`;
  });
  return lines.join('\n');
}

export default function ChaptersPanel({ chapters = [], description, onAppendToDescription }) {
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);

  if (!chapters.length) return null;

  const chaptersText = buildChaptersText(chapters);
  const alreadyInDesc = description?.includes('0:00') && description?.includes(chapters[0]?.headline?.slice(0, 20) || '');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(chaptersText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  const insertIntoDescription = () => {
    const block = `\n\n📍 Chapters\n${chaptersText}\n`;
    onAppendToDescription?.(block);
    setInserted(true);
    setTimeout(() => setInserted(false), 2000);
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-900">
            Auto-Chapters Detected
          </span>
          <Badge className="bg-amber-100 text-amber-700 text-[10px]">
            {chapters.length} chapters
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={copy} className="h-7 text-xs gap-1 border-amber-300">
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          {!alreadyInDesc && (
            <Button
              size="sm"
              onClick={insertIntoDescription}
              className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-700"
            >
              {inserted ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              {inserted ? 'Added' : 'Add to Description'}
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white border border-amber-100 rounded p-2 max-h-40 overflow-y-auto">
        <pre className="text-[11px] font-mono text-gray-700 whitespace-pre-wrap">{chaptersText}</pre>
      </div>

      <p className="text-[10px] text-amber-700">
        💡 YouTube requires chapters: first at 0:00, at least 3 total, each ≥ 10s. Auto-detected via transcript.
      </p>
    </div>
  );
}