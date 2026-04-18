import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tag, FileText, Hash, MessageSquare, Copy, Check, TrendingUp } from 'lucide-react';

function CopyButton({ value, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) {}
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handle}
      disabled={!value}
      className="h-6 px-2 text-[10px] gap-1"
    >
      {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

function ScoreBar({ label, value, max = 10 }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value >= 8 ? 'bg-green-500' : value >= 6 ? 'bg-amber-500' : 'bg-gray-400';
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-gray-500 w-12 truncate">{label}</span>
      <div className="flex-1 h-1 bg-gray-100 rounded overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] font-medium text-gray-600 w-4 text-right">{value || 0}</span>
    </div>
  );
}

export default function SeoReviewStep({
  titleOptions, titleObjects, title, onTitleChange,
  descriptionOptions, description, onDescriptionChange,
  tags, onTagsChange,
  seoAnalysis, hashtags, pinnedComment,
}) {
  const tagCount = tags.split(',').filter(t => t.trim()).length;
  const totalTagChars = tags.replace(/,\s*/g, ',').length;
  const hashtagsString = Array.isArray(hashtags) ? hashtags.join(' ') : '';

  return (
    <div className="space-y-4">
      {/* SEO Analysis */}
      {seoAnalysis && (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="p-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="bg-white/70 rounded-lg p-2">
                <span className="text-gray-500 block mb-0.5">Primary Keyword</span>
                <span className="font-bold text-blue-900 truncate block">{seoAnalysis.primary_keyword || '—'}</span>
              </div>
              <div className="bg-white/70 rounded-lg p-2">
                <span className="text-gray-500 block mb-0.5">Search Volume</span>
                <span className="font-bold">{seoAnalysis.estimated_search_volume || '—'}</span>
              </div>
              <div className="bg-white/70 rounded-lg p-2">
                <span className="text-gray-500 block mb-0.5">Competition</span>
                <Badge className={`text-[10px] ${
                  seoAnalysis.competition === 'low' ? 'bg-green-100 text-green-800' :
                  seoAnalysis.competition === 'medium' ? 'bg-amber-100 text-amber-800' :
                  'bg-red-100 text-red-800'
                }`}>{seoAnalysis.competition || '—'}</Badge>
              </div>
              <div className="bg-white/70 rounded-lg p-2">
                <span className="text-gray-500 block mb-0.5">Best Upload</span>
                <span className="font-bold text-[11px]">{seoAnalysis.recommended_upload_day || '—'} {seoAnalysis.recommended_upload_time || ''}</span>
              </div>
            </div>
            {seoAnalysis.niche_opportunity && (
              <div className="mt-2 p-2 bg-white/50 rounded text-[11px] text-gray-700 flex items-start gap-1.5">
                <TrendingUp className="w-3 h-3 text-indigo-600 mt-0.5 flex-shrink-0" />
                <span><b>Opportunity:</b> {seoAnalysis.niche_opportunity}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Title */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium">Title</label>
          <CopyButton value={title} />
        </div>
        <Input value={title} onChange={e => onTitleChange(e.target.value)} placeholder="Video title" maxLength={100} />
        <div className="flex items-center justify-between mt-0.5">
          <span className={`text-[10px] ${title.length > 60 ? 'text-red-500' : title.length > 50 ? 'text-amber-500' : 'text-gray-400'}`}>
            {title.length}/100 {title.length > 60 && '• too long for mobile preview'}
          </span>
        </div>
        {titleOptions.length > 1 && (
          <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
            {titleOptions.map((t, i) => {
              const obj = titleObjects?.[i];
              const selected = title === t;
              return (
                <button
                  key={i}
                  onClick={() => onTitleChange(t)}
                  className={`w-full text-left p-2 rounded border text-xs transition-colors ${
                    selected
                      ? 'bg-blue-50 text-blue-900 border-blue-300'
                      : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-gray-400 mt-0.5">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{t}</p>
                      {obj && (
                        <div className="mt-1.5 grid grid-cols-3 gap-2">
                          <ScoreBar label="Scroll" value={obj.scroll_stop_score || 0} />
                          <ScoreBar label="SEO" value={obj.keyword_density_score || 0} />
                          <ScoreBar label="Thumb" value={obj.thumbnail_pairing_score || 0} />
                        </div>
                      )}
                      {obj?.why_it_works && (
                        <p className="text-[10px] text-gray-500 mt-1 italic">{obj.why_it_works}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Description */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Description</label>
          <CopyButton value={description} />
        </div>
        <Textarea value={description} onChange={e => onDescriptionChange(e.target.value)} rows={5} placeholder="Video description" className="text-sm" />
        <p className="text-[10px] text-gray-400 mt-0.5">{description.length}/5000</p>
        {descriptionOptions.length > 1 && (
          <div className="flex gap-1 mt-1.5">
            {descriptionOptions.map((d, i) => (
              <button key={i} onClick={() => onDescriptionChange(d.content)}
                className={`flex-1 px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${description === d.content ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent'}`}>
                {d.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tags */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Tags</label>
          <CopyButton value={tags} />
        </div>
        <Textarea value={tags} onChange={e => onTagsChange(e.target.value)} rows={2} placeholder="tag1, tag2, tag3..." className="text-xs" />
        <p className={`text-[10px] mt-0.5 ${totalTagChars > 500 ? 'text-red-500' : 'text-gray-400'}`}>
          {tagCount} tags • {totalTagChars}/500 chars {totalTagChars > 500 && '• over YouTube limit'}
        </p>
      </div>

      {/* Hashtags + Pinned Comment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {hashtags && hashtags.length > 0 && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-1.5 mb-2">
              <Hash className="w-3.5 h-3.5 text-pink-600" />
              <span className="text-xs font-semibold flex-1">Hashtags</span>
              <CopyButton value={hashtagsString} label="" />
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
              <span className="text-xs font-semibold flex-1">Pinned Comment</span>
              <CopyButton value={pinnedComment} label="" />
            </div>
            <p className="text-xs text-gray-600">{pinnedComment}</p>
          </div>
        )}
      </div>
    </div>
  );
}