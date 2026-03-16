import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, Plus, X } from 'lucide-react';

const NICHE_OPTIONS = [
  'Finance', 'Technology', 'Health', 'Education', 'Entertainment',
  'Gaming', 'Travel', 'Food', 'Real Estate', 'Legal', 'Science', 'Lifestyle'
];

export default function CompetitorInput({ onAnalyze, loading }) {
  const [ids, setIds] = useState(['', '', '']);
  const [niche, setNiche] = useState('');

  const activeCount = ids.filter(id => id.trim()).length;

  const updateId = (index, value) => {
    // Extract channel ID from URL if pasted
    let cleaned = value.trim();
    const match = cleaned.match(/(?:youtube\.com\/(?:channel\/|@))([a-zA-Z0-9_-]+)/);
    if (match) cleaned = match[1];
    const next = [...ids];
    next[index] = cleaned;
    setIds(next);
  };

  const handleSubmit = () => {
    const valid = ids.filter(id => id.trim());
    if (valid.length === 0) return;
    onAnalyze(valid, niche);
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-gray-900 text-sm">Add Competitor Channels</h3>
          <span className="text-[10px] text-gray-400 ml-auto">Paste channel ID or URL</span>
        </div>

        <div className="space-y-3 mb-4">
          {ids.map((id, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-400 w-4">{i + 1}.</span>
              <Input
                placeholder={`Channel ID or youtube.com/channel/... ${i === 0 ? '' : '(optional)'}`}
                value={id}
                onChange={(e) => updateId(i, e.target.value)}
                className="text-sm font-mono"
              />
              {id && (
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => updateId(i, '')}>
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label className="text-xs text-gray-500 mb-1">Niche (for CPM estimation)</Label>
            <Select value={niche} onValueChange={setNiche}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Select niche..." />
              </SelectTrigger>
              <SelectContent>
                {NICHE_OPTIONS.map(n => (
                  <SelectItem key={n} value={n.toLowerCase()}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={loading || activeCount === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Search className="w-4 h-4 mr-1" />}
            Analyze {activeCount > 0 ? `(${activeCount})` : ''}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}