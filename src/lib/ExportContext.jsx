import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { saveExportedVideo } from '@/utils/videoStorage';
import { base44 } from '@/api/base44Client';

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
      r2Status: 'uploading',
    });

    // Auto-upload to R2 in background
    uploadToR2(projectId, blob, filename).catch(err => {
      console.error('[ExportContext] R2 upload failed:', err);
      updateJob(projectId, { r2Status: 'failed', r2Error: err.message });
    });
  }, [updateJob]);

  const uploadToR2 = useCallback(async (projectId, blob, filename) => {
    const MAX_CHUNK = 4 * 1024 * 1024; // 4MB base64 safe limit per request
    const sizeMB = blob.size / (1024 * 1024);

    updateJob(projectId, { r2Status: 'uploading', r2Progress: 0 });

    // Get project name from job
    const job = jobsRef.current[projectId];
    const projectName = job?.projectName || '';

    // Convert blob to base64
    const reader = new FileReader();
    const base64 = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    updateJob(projectId, { r2Progress: 30 });

    const res = await base44.functions.invoke('uploadToR2', {
      file_base64: base64,
      filename,
      content_type: 'video/mp4',
      project_id: projectId,
      project_name: projectName,
    });

    const data = res.data || res;
    if (data.success && data.url) {
      updateJob(projectId, {
        r2Status: 'done',
        r2Url: data.url,
        r2Progress: 100,
      });
      console.log(`☁️ Uploaded to R2: ${data.url} (${data.size_mb}MB)`);
    } else {
      throw new Error(data.error || 'R2 upload failed');
    }
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