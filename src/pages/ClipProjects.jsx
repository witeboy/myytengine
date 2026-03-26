import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Scissors, Plus, Trash2, Loader2, Clock, Flame,
  ArrowLeft, FolderOpen, CheckCircle, AlertCircle,
  FileVideo, Calendar, Youtube, RefreshCw,
} from 'lucide-react';

var STATUS_CONFIG = {
  uploading:    { label: 'Uploading',     bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  transcribing: { label: 'Transcribing',  bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  analyzing:    { label: 'Analyzing',     bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
  complete:     { label: 'Complete',      bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  failed:       { label: 'Failed',        bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDuration(sec) {
  if (!sec) return '';
  var m = Math.floor(sec / 60);
  var s = Math.floor(sec % 60);
  return m + 'm ' + s + 's';
}

export default function ClipProjects() {
  var [projects, setProjects] = useState([]);
  var [loading, setLoading] = useState(true);
  var [deleting, setDeleting] = useState(null);
  var navigate = useNavigate();

  useEffect(function() { loadProjects(); }, []);

  var loadProjects = async function() {
    setLoading(true);
    try {
      var records = await base44.entities.UploadMetadata.filter({ record_type: 'clip_project' });
      var sorted = (records || []).sort(function(a, b) {
        return new Date(b.created_date || 0) - new Date(a.created_date || 0);
      });
      setProjects(sorted);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  var deleteProject = async function(projectId) {
    if (!confirm('Delete this project and all its clips?')) return;
    setDeleting(projectId);
    try {
      await base44.entities.UploadMetadata.delete(projectId);
      setProjects(function(prev) { return prev.filter(function(p) { return p.id !== projectId; }); });
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleting(null);
    }
  };

  var openProject = function(project) {
    navigate('/ClipExtractor?project=' + project.id);
  };

  var getAvgVirality = function(project) {
    try {
      var clips = JSON.parse(project.clip_data || '[]');
      if (!clips.length) return 0;
      var total = clips.reduce(function(s, c) { return s + (c.virality_score || 0); }, 0);
      return Math.round(total / clips.length);
    } catch (_e) { return 0; }
  };

  var getClipCount = function(project) {
    return project.clips_count || 0;
  };

  // Count scheduled posts
  var [scheduledCount, setScheduledCount] = useState(0);
  useEffect(function() {
    base44.entities.UploadMetadata.filter({ record_type: 'scheduled_post', status: 'scheduled' })
      .then(function(posts) { setScheduledCount((posts || []).length); })
      .catch(function() {});
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Link to="/Dashboard" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-3 h-3" /> Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mt-2 flex items-center gap-2">
              <FolderOpen className="w-6 h-6 text-gray-700" />
              Clip Projects
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              All your clipped videos — open to view clips, schedule, or auto-post
            </p>
          </div>
          <div className="flex gap-2">
            {scheduledCount > 0 && (
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 gap-1">
                <Calendar className="w-3 h-3" />
                {scheduledCount} scheduled
              </Badge>
            )}
            <Link to="/ClipExtractor">
              <Button size="sm" className="gap-1.5 bg-gray-900 hover:bg-gray-800 text-white">
                <Plus className="w-3.5 h-3.5" /> New Project
              </Button>
            </Link>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {/* Empty state */}
        {!loading && projects.length === 0 && (
          <Card className="border-gray-200">
            <CardContent className="p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center mx-auto">
                <Scissors className="w-8 h-8 text-gray-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-700">No clip projects yet</p>
                <p className="text-sm text-gray-400 mt-1">Upload a video or paste a YouTube URL to get started</p>
              </div>
              <Link to="/ClipExtractor">
                <Button className="gap-1.5 bg-gray-900 hover:bg-gray-800 text-white">
                  <Plus className="w-4 h-4" /> Create First Project
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Projects grid */}
        {!loading && projects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(function(project) {
              var statusConf = STATUS_CONFIG[project.status] || STATUS_CONFIG.complete;
              var avgVirality = getAvgVirality(project);
              var clipCount = getClipCount(project);
              var isProcessing = ['uploading', 'transcribing', 'analyzing'].includes(project.status);

              return (
                <Card key={project.id} className="overflow-hidden border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer group"
                  onClick={function() { openProject(project); }}>
                  <CardContent className="p-0">
                    {/* Thumbnail area */}
                    <div className="relative h-36 bg-gray-900 flex items-center justify-center">
                      {project.video_url ? (
                        <video src={project.video_url} className="w-full h-full object-cover opacity-70" preload="metadata" muted />
                      ) : (
                        <FileVideo className="w-10 h-10 text-gray-600" />
                      )}
                      {/* Status badge */}
                      <div className="absolute top-2 right-2">
                        <Badge variant="outline" className={'text-[10px] ' + statusConf.bg + ' ' + statusConf.text + ' ' + statusConf.border}>
                          {isProcessing && <Loader2 className="w-2.5 h-2.5 mr-0.5 animate-spin" />}
                          {!isProcessing && project.status === 'complete' && <CheckCircle className="w-2.5 h-2.5 mr-0.5" />}
                          {project.status === 'failed' && <AlertCircle className="w-2.5 h-2.5 mr-0.5" />}
                          {statusConf.label}
                        </Badge>
                      </div>
                      {/* Clip count overlay */}
                      {clipCount > 0 && (
                        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded bg-black/70 text-white text-xs">
                          <Scissors className="w-3 h-3" />
                          {clipCount} clips
                        </div>
                      )}
                      {/* Virality badge */}
                      {avgVirality > 0 && (
                        <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-black/70 text-xs">
                          <Flame className={'w-3 h-3 ' + (avgVirality >= 80 ? 'text-red-400' : 'text-amber-400')} />
                          <span className="text-white font-bold">{avgVirality}</span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3 space-y-2">
                      <p className="text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-blue-700 transition-colors">
                        {project.title_primary || 'Untitled Project'}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">
                          {formatDate(project.created_date)}
                        </span>
                        <button
                          onClick={function(e) { e.stopPropagation(); deleteProject(project.id); }}
                          className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded"
                          disabled={deleting === project.id}
                        >
                          {deleting === project.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Refresh */}
        {!loading && projects.length > 0 && (
          <div className="text-center">
            <Button variant="outline" size="sm" className="text-xs gap-1" onClick={loadProjects}>
              <RefreshCw className="w-3 h-3" /> Refresh
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
