import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tag, FileText, Hash, MessageSquare } from 'lucide-react';

export default function SeoReviewStep({
  titleOptions, title, onTitleChange,
  descriptionOptions, description, onDescriptionChange,
  tags, onTagsChange,
  seoAnalysis, hashtags, pinnedComment,
}) {
  return (
    <div className="space-y-4">
      {/* SEO Analysis */}
      {seoAnalysis && (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="p-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="bg-white/70 rounded-lg p-2">
                <span className="text-gray-500 block mb-0.5">Primary Keyword</span>
                <span className="font-bold text-blue-900">{seoAnalysis.primary_keyword}</span>
              </div>
              <div className="bg-white/70 rounded-lg p-2">
                <span className="text-gray-500 block mb-0.5">Search Volume</span>
                <span className="font-bold">{seoAnalysis.estimated_search_volume}</span>
              </div>
              <div className="bg-white/70 rounded-lg p-2">
                <span className="text-gray-500 block mb-0.5">Competition</span>
                <Badge className={`text-[10px] ${
                  seoAnalysis.competition === 'low' ? 'bg-green-100 text-green-800' :
                  seoAnalysis.competition === 'medium' ? 'bg-amber-100 text-amber-800' :
                  'bg-red-100 text-red-800'
                }`}>{seoAnalysis.competition}</Badge>
              </div>
              <div className="bg-white/70 rounded-lg p-2">
                <span className="text-gray-500 block mb-0.5">Best Upload</span>
                <span className="font-bold">{seoAnalysis.recommended_upload_day} {seoAnalysis.recommended_upload_time}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Title */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">Title</label>
        <Input value={title} onChange={e => onTitleChange(e.target.value)} placeholder="Video title" maxLength={100} />
        <span className={`text-[10px] ${title.length > 60 ? 'text-red-500' : 'text-gray-400'}`}>{title.length}/100</span>
        {titleOptions.length > 1 && (
          <div className="mt-1.5 max-h-32 overflow-y-auto space-y-1">
            {titleOptions.map((t, i) => (
              <button key={i} onClick={() => onTitleChange(t)}
                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${title === t ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="text-sm font-medium mb-1.5 block flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Description</label>
        <Textarea value={description} onChange={e => onDescriptionChange(e.target.value)} rows={5} placeholder="Video description" className="text-sm" />
        {descriptionOptions.length > 1 && (
          <div className="flex gap-1 mt-1.5">
            {descriptionOptions.map((d, i) => (
              <button key={i} onClick={() => onDescriptionChange(d.content)}
                className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${description === d.content ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {d.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tags */}
      <div>
        <label className="text-sm font-medium mb-1.5 block flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Tags</label>
        <Textarea value={tags} onChange={e => onTagsChange(e.target.value)} rows={2} placeholder="tag1, tag2, tag3..." className="text-xs" />
        <p className="text-[10px] text-gray-400 mt-0.5">{tags.split(',').filter(t => t.trim()).length} tags</p>
      </div>

      {/* Hashtags + Pinned Comment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {hashtags && hashtags.length > 0 && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-1.5 mb-2">
              <Hash className="w-3.5 h-3.5 text-pink-600" />
              <span className="text-xs font-semibold">Hashtags</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {hashtags.map((h, i) => (
                <Badge key={i} className="text-[10px] bg-pink-50 text-pink-700">{h}</Badge>
              ))}
            </div>
          </div>
        )}
        {pinnedComment && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-1.5 mb-2">
              <MessageSquare className="w-3.5 h-3.5 text-orange-600" />
              <span className="text-xs font-semibold">Pinned Comment</span>
            </div>
            <p className="text-xs text-gray-600">{pinnedComment}</p>
          </div>
        )}
      </div>
    </div>
  );
}