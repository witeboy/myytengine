import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Loader2, Wand2, Check, Copy, AlertCircle, ChevronDown, ChevronUp,
  Sparkles, RotateCw
} from 'lucide-react';
import PlatformIcon, { PLATFORM_META } from './PlatformIcon';

export default function PlatformAdaptCard({
  platform,
  sourceTitle,
  sourceDescription,
  sourceTags,
  sourceHashtags,
  niche,
  onAdapted,
  adaptedData,
  disabled,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editHashtags, setEditHashtags] = useState('');
  const [copied, setCopied] = useState('');

  const meta = PLATFORM_META[platform];
  if (!meta) return null;

  const handleAdapt = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('adaptForPlatform', {
        platform,
        title: sourceTitle,
        description: sourceDescription,
        tags: sourceTags,
        hashtags: sourceHashtags,
        niche,
      });
      const data = res.data;
      setEditTitle(data.adapted_title || '');
      setEditDesc(data.adapted_description || '');
      setEditTags((data.adapted_tags || []).join(', '));
      setEditHashtags((data.adapted_hashtags || []).join(' '));
      setExpanded(true);
      onAdapted?.(platform, data);
    } catch (e) {
      setError(e.message || 'Adaptation failed');
    }
    setLoading(false);
  };

  const handleCopy = (field, text) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(''), 1500);
  };

  const isAdapted = !!adaptedData || !!editDesc;
  const score = adaptedData?.optimization_score;

  return (
    <Card className={`transition-all ${isAdapted ? `${meta.borderColor} border-2` : 'border'}`}>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => isAdapted && setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg ${meta.color} flex items-center justify-center text-white`}>
            <PlatformIcon platform={platform} className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-sm flex items-center gap-2">
              {meta.name}
              {isAdapted && (
                <Badge className="bg-green-100 text-green-700 text-[10px]">
                  <Check className="w-2.5 h-2.5 mr-0.5" /> Adapted
                </Badge>
              )}
              {score && (
                <Badge className={`text-[10px] ${score >= 8 ? 'bg-green-100 text-green-700' : score >= 6 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                  Score: {score}/10
                </Badge>
              )}
            </CardTitle>
            {adaptedData?.optimization_notes && !expanded && (
              <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{adaptedData.optimization_notes}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isAdapted ? (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleAdapt(); }}
                disabled={loading || disabled}
                className="gap-1.5 text-xs"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                {loading ? 'Adapting...' : 'Adapt'}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); handleAdapt(); }}
                  disabled={loading}
                  className="gap-1 text-[10px] h-7"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                  Re-adapt
                </Button>
                {isAdapted && (expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />)}
              </>
            )}
          </div>
        </div>
      </CardHeader>

      {error && (
        <CardContent className="pt-0 pb-2">
          <div className="flex items-center gap-2 p-2 bg-red-50 rounded text-xs text-red-700">
            <AlertCircle className="w-3 h-3" /> {error}
          </div>
        </CardContent>
      )}

      {loading && !isAdapted && (
        <CardContent className="pt-0 pb-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <Sparkles className="w-3 h-3 animate-pulse" />
              AI is rewriting for {meta.name}'s algorithm...
            </div>
            <Progress value={45} className="h-1.5" />
          </div>
        </CardContent>
      )}

      {expanded && isAdapted && (
        <CardContent className="pt-0 space-y-3">
          {/* Tips */}
          {adaptedData?.platform_tips && (
            <div className={`p-2 rounded-lg ${meta.bgLight} space-y-1`}>
              <p className="text-[10px] font-semibold text-gray-600 uppercase">Platform Tips</p>
              {adaptedData.platform_tips.map((tip, i) => (
                <p key={i} className="text-[10px] text-gray-600">• {tip}</p>
              ))}
            </div>
          )}

          {/* Adapted Title */}
          {(platform === 'youtube' || platform === 'tiktok') && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium">Title</label>
                <button onClick={() => handleCopy('title', editTitle)} className="text-gray-400 hover:text-gray-600">
                  {copied === 'title' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="text-sm h-8" />
              <span className="text-[9px] text-gray-400">{editTitle.length} chars</span>
            </div>
          )}

          {/* Adapted Description/Caption */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium">{platform === 'x' ? 'Post' : 'Caption / Description'}</label>
              <button onClick={() => handleCopy('desc', editDesc)} className="text-gray-400 hover:text-gray-600">
                {copied === 'desc' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={platform === 'x' ? 3 : 5} className="text-xs" />
            <span className={`text-[9px] ${
              (platform === 'x' && editDesc.length > 280) ? 'text-red-500' : 'text-gray-400'
            }`}>{editDesc.length} chars {adaptedData?.limits?.description_max ? `/ ${adaptedData.limits.description_max}` : ''}</span>
          </div>

          {/* Tags */}
          {editTags && platform === 'youtube' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium">Tags</label>
                <button onClick={() => handleCopy('tags', editTags)} className="text-gray-400 hover:text-gray-600">
                  {copied === 'tags' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <Textarea value={editTags} onChange={e => setEditTags(e.target.value)} rows={2} className="text-[10px]" />
            </div>
          )}

          {/* Hashtags */}
          {editHashtags && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium">Hashtags</label>
                <button onClick={() => handleCopy('hashtags', editHashtags)} className="text-gray-400 hover:text-gray-600">
                  {copied === 'hashtags' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {editHashtags.split(/\s+/).filter(Boolean).map((h, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] font-normal">{h}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Optimization notes */}
          {adaptedData?.optimization_notes && (
            <p className="text-[10px] text-gray-500 italic border-t pt-2">
              <Sparkles className="w-3 h-3 inline mr-1" />{adaptedData.optimization_notes}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}