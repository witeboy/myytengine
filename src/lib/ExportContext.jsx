import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { saveExportedVideo } from '@/utils/videoStorage';

const ExportContext = createContext(null);

export function useExport() {
  return useContext(ExportContext);
}

export function ExportProvider({ children }) {
  const [jobs, setJobs] = useState({}); // { [projectId]: { status, progress, phase, error, projectName, blob, filename, fileSize } }
  const jobsRef = useRef({});

  const updateJob = useCallback((projectId, updates) => {
    setJobs(prev => {
      const next = { ...prev, [projectId]: { ...prev[projectId], ...updates } };
      jobsRef.current = next;
      return next;
    });
  }, []);

  const startJob = useCallback((projectId, projectName) => {
    updateJob(projectId, {
      status: 'exporting',
      progress: 0,
      phase: 'checking',
      error: null,
      projectName: projectName || 'Video',
      blob: null,
      filename: null,
      fileSize: null,
      startedAt: Date.now(),
    });
  }, [updateJob]);

  const completeJob = useCallback(async (projectId, blob, filename) => {
    const fileSize = (blob.size / (1024 * 1024)).toFixed(1);

    // Save to IndexedDB
    if (projectId) {
      await saveExportedVideo(String(projectId), blob, filename).catch(err =>
        console.error('[ExportContext] IndexedDB save failed:', err)
      );
    }

    // Create download URL
    const downloadUrl = URL.createObjectURL(blob);

    updateJob(projectId, {
      status: 'done',
      progress: 100,
      phase: 'done',
      blob,
      filename,
      fileSize,
      downloadUrl,
      completedAt: Date.now(),
    });
  }, [updateJob]);

  const failJob = useCallback((projectId, errorMsg) => {
    updateJob(projectId, {
      status: 'failed',
      error: errorMsg,
    });
  }, [updateJob]);

  const dismissJob = useCallback((projectId) => {
    setJobs(prev => {
      const next = { ...prev };
      // Revoke blob URL if exists
      if (next[projectId]?.downloadUrl) {
        URL.revokeObjectURL(next[projectId].downloadUrl);
      }
      delete next[projectId];
      jobsRef.current = next;
      return next;
    });
  }, []);

  const downloadJob = useCallback((projectId) => {
    const job = jobsRef.current[projectId];
    if (!job?.downloadUrl) return;
    const a = document.createElement('a');
    a.href = job.downloadUrl;
    a.download = job.filename || 'export.mp4';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const value = {
    jobs,
    startJob,
    updateJob,
    completeJob,
    failJob,
    dismissJob,
    downloadJob,
  };

  return (
    <ExportContext.Provider value={value}>
      {children}
    </ExportContext.Provider>
  );
}