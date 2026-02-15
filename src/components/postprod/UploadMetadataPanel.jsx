import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Copy, CheckCircle2, Type, FileText, Hash, MessageSquare, Tag
} from 'lucide-react';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="icon" onClick={handleCopy} className="h-7 w-7 flex-shrink-0">
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
    </Button>
  );
}

function TitleOption({ label, value, isSelected, onSelect }) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
        isSelected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="flex-1">
        <span className="text-xs text-gray-500 block mb-0.5">{label}</span>
        <p className="text-sm font-medium">{value}</p>
      </div>
      <CopyButton text={value} />
    </div>
  );
}

export default function UploadMetadataPanel({ metadata, onRefetch }) {
  const [editingDesc, setEditingDesc] = useState(null);
  const [selectedTitle, setSelectedTitle] = useState('primary');

  if (!metadata) return null;

  let tags = [];
  try { tags = JSON.parse(metadata.tags || '[]'); } catch { tags = []; }

  const descriptions = [
    { key: 'description_template', label: 'Primary', value: metadata.description_template },
    { key: 'description_alt_1', label: 'Alternative 1', value: metadata.description_alt_1 },
    { key: 'description_alt_2', label: 'Alternative 2', value: metadata.description_alt_2 },
  ];

  const handleSaveDescription = async (key, value) => {
    await base44.entities.UploadMetadata.update(metadata.id, { [key]: value });
    onRefetch();
    setEditingDesc(null);
  };

  return (
    <div className="space-y-6">
      {/* Titles */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Type className="w-4 h-4 text-blue-600" />
            Video Titles
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <TitleOption
            label="Primary Title"
            value={metadata.title_primary}
            isSelected={selectedTitle === 'primary'}
            onSelect={() => setSelectedTitle('primary')}
          />
          <TitleOption
            label="Variation 1"
            value={metadata.title_variation_1}
            isSelected={selectedTitle === 'var1'}
            onSelect={() => setSelectedTitle('var1')}
          />
          <TitleOption
            label="Variation 2"
            value={metadata.title_variation_2}
            isSelected={selectedTitle === 'var2'}
            onSelect={() => setSelectedTitle('var2')}
          />
        </CardContent>
      </Card>

      {/* Descriptions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-600" />
            Descriptions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {descriptions.map(desc => (
            <div key={desc.key} className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">{desc.label}</span>
                <div className="flex gap-1">
                  <CopyButton text={desc.value} />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setEditingDesc(editingDesc === desc.key ? null : desc.key)}
                  >
                    {editingDesc === desc.key ? 'Cancel' : 'Edit'}
                  </Button>
                </div>
              </div>
              {editingDesc === desc.key ? (
                <div className="space-y-2">
                  <Textarea
                    defaultValue={desc.value}
                    id={`edit-${desc.key}`}
                    className="text-sm min-h-[120px]"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      const el = document.getElementById(`edit-${desc.key}`);
                      handleSaveDescription(desc.key, el.value);
                    }}
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">{desc.value}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Tags & Hashtags */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="w-4 h-4 text-green-600" />
              Tags
              <CopyButton text={tags.join(', ')} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Hash className="w-4 h-4 text-pink-600" />
              Hashtags
              <CopyButton text={metadata.hashtags} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700">{metadata.hashtags}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pinned Comment */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-orange-600" />
            Pinned Comment
            <CopyButton text={metadata.pinned_comment} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{metadata.pinned_comment}</p>
        </CardContent>
      </Card>
    </div>
  );
}