import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Eye, Pencil } from 'lucide-react';
import ReactQuill from 'react-quill';

export default function ScriptEditor({ script, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (script?.full_script) {
      // Convert plain text to HTML for the editor
      const html = script.full_script
        .split('\n\n')
        .map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
        .join('');
      setContent(html);
    }
  }, [script?.id]);

  const handleSave = async () => {
    setSaving(true);
    // Convert HTML back to plain text
    const temp = document.createElement('div');
    temp.innerHTML = content;
    const plainText = temp.innerText || temp.textContent;
    const wordCount = plainText.split(/\s+/).filter(w => w.length > 0).length;

    await base44.entities.Scripts.update(script.id, {
      full_script: plainText,
      word_count: wordCount,
      estimated_duration_sec: Math.round((wordCount / 150) * 60),
    });
    setEditing(false);
    setSaving(false);
    onSaved?.();
  };

  if (!script) return null;

  const plainText = script.full_script || '';
  const wordCount = plainText.split(/\s+/).filter(w => w.length > 0).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {editing ? <Pencil className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            Full Script {editing ? '(Editing)' : 'Preview'}
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{wordCount.toLocaleString()} words</span>
            <span className="text-sm text-gray-500">~{Math.round((wordCount / 150))} min</span>
            {!editing ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700">
                  {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                  Save
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <ReactQuill
            value={content}
            onChange={setContent}
            theme="snow"
            className="bg-white"
            style={{ minHeight: 400 }}
            modules={{
              toolbar: [
                ['bold', 'italic', 'underline'],
                [{ header: [1, 2, 3, false] }],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['clean'],
              ],
            }}
          />
        ) : (
          <div className="bg-gray-50 p-6 rounded-lg text-sm text-gray-700 whitespace-pre-wrap max-h-[600px] overflow-y-auto leading-relaxed">
            {script.full_script}
          </div>
        )}
      </CardContent>
    </Card>
  );
}