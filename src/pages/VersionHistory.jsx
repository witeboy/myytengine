import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  History, RotateCcw, Save, Eye, GitBranch, ChevronDown,
  ChevronUp, Loader2, Clock, FileText, ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import VersionCompareModal from '@/components/versions/VersionCompareModal';

export default function VersionHistory() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [expandedVersion, setExpandedVersion] = useState(null);
  const [reverting, setReverting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [compareVersions, setCompareVersions] = useState(null);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['versions', projectId],
    queryFn: () => base44.entities.ProjectVersions.filter({ project_id: projectId }, '-version_number'),
    enabled: !!projectId,
  });

  const { data: scenes = [] } = useQuery({
    queryKey: ['scenes-version', projectId],
    queryFn: () => base44.entities.Scenes.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const handleSaveVersion = async () => {
    setSaving(true);
    const nextNum = versions.length > 0 ? Math.max(...versions.map(v => v.version_number)) + 1 : 1;

    const projectSnapshot = { ...project };
    delete projectSnapshot.id;
    delete projectSnapshot.created_date;
    delete projectSnapshot.updated_date;

    const scenesSnapshot = scenes.map(s => {
      const copy = { ...s };
      delete copy.id;
      delete copy.created_date;
      delete copy.updated_date;
      return copy;
    });

    await base44.entities.ProjectVersions.create({
      project_id: projectId,
      version_number: nextNum,
      label: `v${nextNum} — ${project?.status?.replace(/_/g, ' ') || 'manual save'}`,
      snapshot_data: JSON.stringify(projectSnapshot),
      scenes_snapshot: JSON.stringify(scenesSnapshot),
      change_summary: `Manual save at ${new Date().toLocaleString()}`,
      is_auto: false,
    });

    queryClient.invalidateQueries({ queryKey: ['versions', projectId] });
    setSaving(false);
  };

  const handleRevert = async (version) => {
    if (!confirm(`Revert to version ${version.version_number}? This will overwrite current project state.`)) return;
    setReverting(version.id);

    // Restore project data
    const projectData = JSON.parse(version.snapshot_data);
    delete projectData.created_by;
    await base44.entities.Projects.update(projectId, projectData);

    // Delete current scenes and recreate from snapshot
    const currentScenes = await base44.entities.Scenes.filter({ project_id: projectId });
    for (const s of currentScenes) {
      await base44.entities.Scenes.delete(s.id);
    }

    const scenesData = JSON.parse(version.scenes_snapshot || '[]');
    if (scenesData.length > 0) {
      await base44.entities.Scenes.bulkCreate(scenesData);
    }

    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    queryClient.invalidateQueries({ queryKey: ['scenes-version', projectId] });
    setReverting(null);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <History className="w-7 h-7 text-blue-600" />
              Version History
            </h1>
            <p className="text-gray-500 text-sm">{project?.name || 'Project'} — {versions.length} versions saved</p>
          </div>
          <Button onClick={handleSaveVersion} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Current State
          </Button>
        </div>

        {/* Current state */}
        <Card className="mb-6 border-blue-200 bg-blue-50/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <GitBranch className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-sm">Current State</p>
                <p className="text-xs text-gray-500">
                  Status: {project?.status?.replace(/_/g, ' ')} • {scenes.length} scenes
                </p>
              </div>
            </div>
            <Badge className="bg-blue-100 text-blue-700">Live</Badge>
          </CardContent>
        </Card>

        {/* Versions list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl h-20 animate-pulse" />
            ))}
          </div>
        ) : versions.length === 0 ? (
          <Card className="text-center py-12">
            <History className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No versions saved yet</p>
            <p className="text-sm text-gray-400 mt-1">Click "Save Current State" to create a version</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {versions.map((version, idx) => {
              const isExpanded = expandedVersion === version.id;
              const prevVersion = versions[idx + 1];

              return (
                <Card key={version.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setExpandedVersion(isExpanded ? null : version.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          version.is_auto ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'
                        }`}>
                          v{version.version_number}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{version.label || `Version ${version.version_number}`}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <Clock className="w-3 h-3" />
                            {formatDate(version.created_date)}
                            {version.is_auto && <Badge variant="outline" className="text-[9px] py-0">Auto</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {prevVersion && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCompareVersions({ older: prevVersion, newer: version });
                            }}
                          >
                            <FileText className="w-3 h-3 mr-1" /> Compare
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          disabled={reverting === version.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRevert(version);
                          }}
                        >
                          {reverting === version.id ? (
                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                          ) : (
                            <RotateCcw className="w-3 h-3 mr-1" />
                          )}
                          Revert
                        </Button>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t px-4 py-3 bg-gray-50 text-xs space-y-2">
                        {version.change_summary && (
                          <p className="text-gray-600">{version.change_summary}</p>
                        )}
                        {(() => {
                          const data = JSON.parse(version.snapshot_data || '{}');
                          const scenesData = JSON.parse(version.scenes_snapshot || '[]');
                          return (
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-white p-2 rounded border">
                                <p className="font-medium text-gray-700 mb-1">Project</p>
                                <p>Status: {data.status?.replace(/_/g, ' ')}</p>
                                <p>Niche: {data.niche}</p>
                                <p>Orientation: {data.orientation || 'landscape'}</p>
                                <p>Style: {data.visual_style || 'none'}</p>
                              </div>
                              <div className="bg-white p-2 rounded border">
                                <p className="font-medium text-gray-700 mb-1">Scenes</p>
                                <p>{scenesData.length} scenes saved</p>
                                <p>
                                  {scenesData.filter(s => s.image_url).length} with images,{' '}
                                  {scenesData.filter(s => s.video_url).length} with videos
                                </p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Compare Modal */}
        {compareVersions && (
          <VersionCompareModal
            older={compareVersions.older}
            newer={compareVersions.newer}
            onClose={() => setCompareVersions(null)}
          />
        )}
      </div>
    </div>
  );
}