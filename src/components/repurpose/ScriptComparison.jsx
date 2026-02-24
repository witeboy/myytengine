import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Columns, AlignLeft } from 'lucide-react';

export default function ScriptComparison({ originalScript, newScript, originalTitle, newTitle }) {
  const [viewMode, setViewMode] = useState('sideBySide');

  const origWords = originalScript?.split(/\s+/).filter(w => w).length || 0;
  const newWords = newScript?.split(/\s+/).filter(w => w).length || 0;
  const wordDiff = newWords - origWords;
  const wordPct = origWords > 0 ? Math.round((newWords / origWords) * 100) : 0;

  if (!originalScript || originalScript.length < 100) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Script Comparison</span>
          <Badge variant={wordPct >= 85 && wordPct <= 115 ? 'default' : 'destructive'} className="text-[10px]">
            {wordPct}% of original length
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {wordDiff >= 0 ? '+' : ''}{wordDiff} words
          </Badge>
        </div>
        <div className="flex gap-1">
          <Button variant={viewMode === 'sideBySide' ? 'default' : 'outline'} size="sm" className="h-7 text-[10px] gap-1"
            onClick={() => setViewMode('sideBySide')}>
            <Columns className="w-3 h-3" /> Side by Side
          </Button>
          <Button variant={viewMode === 'stacked' ? 'default' : 'outline'} size="sm" className="h-7 text-[10px] gap-1"
            onClick={() => setViewMode('stacked')}>
            <AlignLeft className="w-3 h-3" /> Stacked
          </Button>
        </div>
      </div>

      {viewMode === 'sideBySide' ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-xs font-medium text-gray-600">Original</span>
              <Badge variant="outline" className="text-[9px] ml-auto">{origWords} words</Badge>
            </div>
            <div className="max-h-[400px] overflow-y-auto text-xs text-gray-600 whitespace-pre-wrap leading-relaxed bg-amber-50/50 rounded-lg p-3 border border-amber-100">
              {originalScript}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-gray-600">New Script</span>
              <Badge variant="outline" className="text-[9px] ml-auto">{newWords} words</Badge>
            </div>
            <div className="max-h-[400px] overflow-y-auto text-xs text-gray-700 whitespace-pre-wrap leading-relaxed bg-emerald-50/50 rounded-lg p-3 border border-emerald-100">
              {newScript}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-xs font-medium text-gray-600">Original — {originalTitle}</span>
              <Badge variant="outline" className="text-[9px]">{origWords} words</Badge>
            </div>
            <div className="max-h-52 overflow-y-auto text-xs text-gray-600 whitespace-pre-wrap leading-relaxed bg-amber-50/50 rounded-lg p-3 border border-amber-100">
              {originalScript}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-gray-600">New — {newTitle}</span>
              <Badge variant="outline" className="text-[9px]">{newWords} words</Badge>
            </div>
            <div className="max-h-52 overflow-y-auto text-xs text-gray-700 whitespace-pre-wrap leading-relaxed bg-emerald-50/50 rounded-lg p-3 border border-emerald-100">
              {newScript}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-gray-400">Word Match</p>
          <p className={`text-sm font-bold ${wordPct >= 85 && wordPct <= 115 ? 'text-green-600' : 'text-amber-600'}`}>{wordPct}%</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-gray-400">Original</p>
          <p className="text-sm font-bold text-gray-700">{origWords}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-gray-400">New</p>
          <p className="text-sm font-bold text-gray-700">{newWords}</p>
        </div>
      </div>
    </div>
  );
}