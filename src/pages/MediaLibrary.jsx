import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Upload, Search, Image, Film, Music, Trash2, Tag, Filter, Loader2,
  FolderOpen, X, Eye, ArrowLeft, CheckSquare
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MediaPreviewModal from '@/components/media/MediaPreviewModal';
import MediaUploadZone from '@/components/media/MediaUploadZone';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'scene_image', label: 'Scene Images' },
  { value: 'scene_video', label: 'Scene Videos' },
  { value: 'background', label: 'Backgrounds' },
  { value: 'overlay', label: 'Overlays' },
  { value: 'music', label: 'Music' },
  { value: 'sfx', label: 'Sound Effects' },
  { value: 'voiceover', label: 'Voiceover' },
  { value: 'reference', label: 'Reference' },
  { value: 'other', label: 'Other' },
];

const FILE_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
];

export default function MediaLibrary() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [previewAsset, setPreviewAsset] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [editingTags, setEditingTags] = useState(null);
  const [tagInput, setTagInput] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['media-assets'],
    queryFn: () => base44.entities.MediaAssets.list('-created_date'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.MediaAssets.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['media-assets'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MediaAssets.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['media-assets'] }),
  });

  const filtered = assets.filter(a => {
    if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
    if (typeFilter !== 'all' && a.file_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchName = (a.filename || '').toLowerCase().includes(q);
      const matchTags = (a.tags || '').toLowerCase().includes(q);
      if (!matchName && !matchTags) return false;
    }
    return true;
  });

  const handleSaveTags = (asset) => {
    updateMutation.mutate({ id: asset.id, data: { tags: tagInput } });
    setEditingTags(null);
    setTagInput('');
  };

  const typeIcon = (type) => {
    if (type === 'image') return <Image className="w-4 h-4 text-green-600" />;
    if (type === 'video') return <Film className="w-4 h-4 text-purple-600" />;
    return <Music className="w-4 h-4 text-amber-600" />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('ChannelsHub'))}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Media Library</h1>
              <p className="text-gray-500 text-sm">{assets.length} assets</p>
            </div>
          </div>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                disabled={bulkDeleting}
                onClick={async () => {
                  if (!confirm(`Delete ${selectedIds.size} selected asset(s)?`)) return;
                  setBulkDeleting(true);
                  for (const id of selectedIds) {
                    await base44.entities.MediaAssets.delete(id);
                  }
                  setSelectedIds(new Set());
                  setBulkDeleting(false);
                  queryClient.invalidateQueries({ queryKey: ['media-assets'] });
                }}
              >
                {bulkDeleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Delete {selectedIds.size} Selected
              </Button>
            )}
            <Button onClick={() => setShowUpload(!showUpload)} className="bg-blue-600 hover:bg-blue-700">
              <Upload className="w-4 h-4 mr-2" /> Upload Media
            </Button>
          </div>
        </div>

        {showUpload && (
          <MediaUploadZone
            onClose={() => setShowUpload(false)}
            onUploaded={() => queryClient.invalidateQueries({ queryKey: ['media-assets'] })}
          />
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by name or tags..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {FILE_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Asset Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-square bg-white rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="text-center py-16">
            <FolderOpen className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">{search || categoryFilter !== 'all' ? 'No matching assets found' : 'No media assets yet'}</p>
            <p className="text-sm text-gray-400 mt-1">Upload images, videos, or audio to get started</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filtered.map(asset => (
              <Card key={asset.id} className={`group overflow-hidden hover:shadow-md transition-shadow ${selectedIds.has(asset.id) ? 'ring-2 ring-blue-500' : ''}`}>
                {/* Thumbnail */}
                <div
                  className="aspect-square bg-gray-100 relative cursor-pointer overflow-hidden"
                  onClick={() => setPreviewAsset(asset)}
                >
                  {/* Selection checkbox */}
                  <div
                    className="absolute top-1.5 right-1.5 z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        if (next.has(asset.id)) next.delete(asset.id);
                        else next.add(asset.id);
                        return next;
                      });
                    }}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${selectedIds.has(asset.id) ? 'bg-blue-500 border-blue-500' : 'bg-white/80 border-gray-300 opacity-0 group-hover:opacity-100'}`}>
                      {selectedIds.has(asset.id) && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                  {asset.file_type === 'image' ? (
                    <img src={asset.file_url} alt={asset.filename} className="w-full h-full object-cover" />
                  ) : asset.file_type === 'video' ? (
                    <div className="w-full h-full flex items-center justify-center bg-purple-50">
                      <Film className="w-10 h-10 text-purple-300" />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-amber-50">
                      <Music className="w-10 h-10 text-amber-300" />
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Eye className="w-6 h-6 text-white" />
                  </div>
                  {/* Type badge */}
                  <div className="absolute top-1.5 left-1.5">
                    <div className="bg-white/90 rounded-full p-1 shadow-sm">
                      {typeIcon(asset.file_type)}
                    </div>
                  </div>
                </div>

                <CardContent className="p-2 space-y-1">
                  <p className="text-xs font-medium truncate">{asset.filename || 'Untitled'}</p>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[9px] py-0 capitalize">
                      {(asset.category || 'other').replace(/_/g, ' ')}
                    </Badge>
                    <div className="flex gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setEditingTags(asset.id);
                          setTagInput(asset.tags || '');
                        }}
                      >
                        <Tag className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-400 hover:text-red-600"
                        onClick={() => {
                          if (confirm('Delete this asset?')) deleteMutation.mutate(asset.id);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  {/* Tags */}
                  {editingTags === asset.id ? (
                    <div className="flex gap-1">
                      <Input
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        placeholder="tag1, tag2"
                        className="h-6 text-[10px]"
                        onKeyDown={e => e.key === 'Enter' && handleSaveTags(asset)}
                      />
                      <Button size="icon" className="h-6 w-6" onClick={() => handleSaveTags(asset)}>✓</Button>
                    </div>
                  ) : asset.tags ? (
                    <div className="flex gap-1 flex-wrap">
                      {asset.tags.split(',').map((tag, i) => (
                        <span key={i} className="text-[9px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded">{tag.trim()}</span>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Preview Modal */}
        {previewAsset && (
          <MediaPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />
        )}
      </div>
    </div>
  );
}