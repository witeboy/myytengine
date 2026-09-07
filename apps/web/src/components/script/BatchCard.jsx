import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, Pencil, Save, X, ChevronDown, ChevronUp } from 'lucide-react';

export default function BatchCard({ batch, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  const startEdit = (e) => {
    e.stopPropagation();
    setEditContent(batch.content);
    setEditing(true);
    setExpanded(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const wordCount = editContent.split(/\s+/).filter(w => w.length > 0).length;
    await base44.entities.ScriptBatches.update(batch.id, {
      content: editContent,
      word_count: wordCount,
    });
    setEditing(false);
    setSaving(false);
    onUpdate?.();
  };

  const handleCancel = () => {
    setEditing(false);
    setEditContent('');
  };

  return (
    <Card className={batch.status === 'completed' ? 'border-green-200' : ''}>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => !editing && setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="font-mono">Batch {batch.batch_number}</Badge>
            <CardTitle className="text-base">{batch.story_segment}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {batch.word_count > 0 && (
              <Badge className="bg-blue-100 text-blue-800">{batch.word_count} words</Badge>
            )}
            {batch.status === 'completed' && !editing && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={startEdit}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            )}
            {batch.status === 'completed' ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : batch.status === 'generating' ? (
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            ) : null}
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </div>
        <p className="text-sm text-gray-500">{batch.focus_area}</p>
      </CardHeader>

      {expanded && batch.content && (
        <CardContent className="space-y-3">
          {editing ? (
            <>
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                className="w-full min-h-[300px] p-4 border rounded-lg text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {editContent.split(/\s+/).filter(w => w.length > 0).length} words
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCancel}>
                    <X className="w-3.5 h-3.5 mr-1" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700">
                    {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                    Save
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto">
              {batch.content}
            </div>
          )}


        </CardContent>
      )}
    </Card>
  );
}