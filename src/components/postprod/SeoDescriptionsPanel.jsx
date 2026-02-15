import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Copy, CheckCircle2, FileText, Tag, Hash, MessageSquare, Pencil, Search
} from 'lucide-react';

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost" size="icon"
      className="h-7 w-7 flex-shrink-0"
      onClick={() => { navigator.clipboard.writeText(text || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
    </Button>
  );
}

export default function SeoDescriptionsPanel({ descriptions, tagsBreakdown, hashtags, pinnedComment, metadata, onRefetch }) {
  const [activeDesc, setActiveDesc] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const handleSave = async () => {
    if (!metadata) return;
    const keys = ['description_template', 'description_alt_1', 'description_alt_2'];
    await base44.entities.UploadMetadata.update(metadata.id, { [keys[activeDesc]]: editText });
    onRefetch();
    setEditing(false);
  };

  return (
    <div className="space-y-5">
      {/* Descriptions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-600" />
            Video Descriptions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 mb-2">
            {(descriptions || []).map((d, i) => (
              <Button
                key={i}
                variant={activeDesc === i ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setActiveDesc(i); setEditing(false); }}
              >
                {d.label}
              </Button>
            ))}
          </div>

          {descriptions?.[activeDesc] && (
            <div className="space-y-3">
              {/* Keywords */}
              <div className="flex flex-wrap gap-1.5">
                {(descriptions[activeDesc].primary_keywords || []).map((k, i) => (
                  <Badge key={i} className="bg-blue-100 text-blue-800 text-[10px]">
                    <Search className="w-2.5 h-2.5 mr-0.5" />{k}
                  </Badge>
                ))}
                {(descriptions[activeDesc].long_tail_keywords || []).map((k, i) => (
                  <Badge key={i} className="bg-green-100 text-green-800 text-[10px]">{k}</Badge>
                ))}
              </div>

              {/* Description content */}
              <div className="border rounded-lg p-3 bg-gray-50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-gray-500 font-medium">Description Content</span>
                  <div className="flex gap-1">
                    <CopyBtn text={descriptions[activeDesc].content} />
                    <Button
                      variant="ghost" size="sm" className="h-7 text-xs gap-1"
                      onClick={() => {
                        if (editing) { setEditing(false); } else { setEditText(descriptions[activeDesc].content); setEditing(true); }
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                      {editing ? 'Cancel' : 'Edit'}
                    </Button>
                  </div>
                </div>
                {editing ? (
                  <div className="space-y-2">
                    <Textarea value={editText} onChange={e => setEditText(e.target.value)} className="text-sm min-h-[200px]" />
                    <Button size="sm" onClick={handleSave}>Save Changes</Button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{descriptions[activeDesc].content}</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tags breakdown */}
      {tagsBreakdown && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="w-4 h-4 text-green-600" />
              Tags (30)
              <CopyBtn text={[...(tagsBreakdown.short || []), ...(tagsBreakdown.medium || []), ...(tagsBreakdown.long || [])].join(', ')} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Short Keywords</p>
              <div className="flex flex-wrap gap-1">
                {(tagsBreakdown.short || []).map((t, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Medium Keywords</p>
              <div className="flex flex-wrap gap-1">
                {(tagsBreakdown.medium || []).map((t, i) => (
                  <Badge key={i} className="bg-blue-50 text-blue-700 text-xs">{t}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Long-tail Keywords</p>
              <div className="flex flex-wrap gap-1">
                {(tagsBreakdown.long || []).map((t, i) => (
                  <Badge key={i} className="bg-green-50 text-green-700 text-xs">{t}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hashtags + Pinned Comment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hashtags && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Hash className="w-4 h-4 text-pink-600" />
                Hashtags
                <CopyBtn text={(hashtags || []).join(' ')} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {(hashtags || []).map((h, i) => (
                  <Badge key={i} className={`text-xs ${i < 3 ? 'bg-pink-100 text-pink-800' : 'bg-gray-100 text-gray-700'}`}>
                    {i < 3 && '⭐ '}{h}
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">First 3 appear above your video title</p>
            </CardContent>
          </Card>
        )}

        {pinnedComment && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-orange-600" />
                Pinned Comment
                <CopyBtn text={pinnedComment} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{pinnedComment}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}