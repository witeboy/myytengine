import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight, Edit, X, RefreshCw } from 'lucide-react';

const REPURPOSE_TEMPLATES = [
  {
    id: 'true_crime_repurpose',
    name: 'True Crime Breakdown',
    emoji: '🔍',
    niche: 'True Crime',
    sampleUrl: 'https://www.youtube.com/watch?v=',
    tweakHint: 'Focus on a different case with the same dramatic style',
    style: 'cinematic_realistic',
    color: 'from-red-500 to-red-700',
  },
  {
    id: 'tech_explainer_repurpose',
    name: 'Tech Deep Dive',
    emoji: '💻',
    niche: 'Technology',
    sampleUrl: 'https://www.youtube.com/watch?v=',
    tweakHint: 'Explain a different technology using the same conversational approach',
    style: 'photorealistic_4k',
    color: 'from-blue-500 to-cyan-600',
  },
  {
    id: 'history_retell',
    name: 'History Retold',
    emoji: '⚔️',
    niche: 'History',
    sampleUrl: 'https://www.youtube.com/watch?v=',
    tweakHint: 'Cover a different historical event with epic cinematic narration',
    style: 'oil_painting',
    color: 'from-amber-500 to-yellow-700',
  },
  {
    id: 'finance_guru',
    name: 'Finance & Money',
    emoji: '💰',
    niche: 'Finance',
    sampleUrl: 'https://www.youtube.com/watch?v=',
    tweakHint: 'Discuss a different financial topic with the same authoritative tone',
    style: 'cinematic_realistic',
    color: 'from-green-500 to-emerald-700',
  },
  {
    id: 'science_cosmos',
    name: 'Science & Space',
    emoji: '🚀',
    niche: 'Science',
    sampleUrl: 'https://www.youtube.com/watch?v=',
    tweakHint: 'Explore a different scientific phenomenon with stunning visuals',
    style: 'photorealistic_4k',
    color: 'from-purple-500 to-indigo-600',
  },
  {
    id: 'psychology_deep',
    name: 'Psychology & Mind',
    emoji: '🧠',
    niche: 'Psychology',
    sampleUrl: 'https://www.youtube.com/watch?v=',
    tweakHint: 'Dive into a different psychological concept with the same introspective style',
    style: 'cinematic_realistic',
    color: 'from-fuchsia-500 to-pink-600',
  },
];

export default function RepurposeTemplates({ onSelectTemplate }) {
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});

  const handleEdit = (t) => {
    setEditing(t.id);
    setEditData({ ...t });
  };

  const handleApply = () => {
    onSelectTemplate(editData);
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-600">Popular Niches</h3>
      {editing ? (
        <Card className="border-emerald-300">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Customize: {editData.name}</p>
              <Button size="icon" variant="ghost" onClick={() => setEditing(null)}><X className="w-4 h-4" /></Button>
            </div>
            <Input value={editData.sampleUrl} onChange={e => setEditData(d => ({ ...d, sampleUrl: e.target.value }))} placeholder="YouTube URL to analyze..." />
            <Textarea value={editData.tweakHint} onChange={e => setEditData(d => ({ ...d, tweakHint: e.target.value }))} placeholder="What to change from original..." className="min-h-[60px]" />
            <Button onClick={handleApply} className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2">
              Start Repurposing <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {REPURPOSE_TEMPLATES.map(t => (
            <Card key={t.id} className="group hover:shadow-md transition-all cursor-pointer overflow-hidden" onClick={() => onSelectTemplate(t)}>
              <div className={`h-1.5 bg-gradient-to-r ${t.color}`} />
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{t.emoji}</span>
                  <p className="text-xs font-semibold">{t.name}</p>
                </div>
                <p className="text-[10px] text-gray-500 mb-2">{t.tweakHint}</p>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[9px]">{t.niche}</Badge>
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); handleEdit(t); }}>
                    <Edit className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}