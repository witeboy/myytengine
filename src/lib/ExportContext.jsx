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
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB raw → ~6.7MB base64 per chunk
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
    const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);

    updateJob(projectId, { r2Status: 'uploading', r2Progress: 0 });

    const job = jobsRef.current[projectId];
    const projectName = job?.projectName || '';

    console.log(`☁️ Starting R2 upload: ${sizeMB}MB in ${totalChunks} chunks`);

    // Step 1: Init multipart upload
    const initRes = await base44.functions.invoke('uploadToR2', {
      action: 'init',
      filename,
      content_type: 'video/mp4',
      project_id: projectId,
      project_name: projectName,
      total_chunks: totalChunks,
      total_size: blob.size,
    });
    const initData = initRes.data || initRes;
    if (!initData.success) throw new Error(initData.error || 'Init failed');

    const { upload_id, r2_key } = initData;
    const parts = [];

    // Step 2: Upload chunks sequentially
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, blob.size);
      const chunkBlob = blob.slice(start, end);

      // Convert chunk to base64
      const chunkBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(chunkBlob);
      });

      const partNumber = i + 1;
      let chunkRes;
      let retries = 0;
      while (retries < 3) {
        try {
          chunkRes = await base44.functions.invoke('uploadToR2', {
            action: 'chunk',
            upload_id,
            r2_key,
            part_number: partNumber,
            chunk_base64: chunkBase64,
          });
          break;
        } catch (err) {
          retries++;
          if (retries >= 3) {
            // Abort the multipart upload on failure
            await base44.functions.invoke('uploadToR2', { action: 'abort', upload_id, r2_key }).catch(() => {});
            throw new Error(`Chunk ${partNumber} failed after 3 retries: ${err.message}`);
          }
          await new Promise(r => setTimeout(r, 2000 * retries));
        }
      }

      const chunkData = chunkRes.data || chunkRes;
      if (!chunkData.success) {
        await base44.functions.invoke('uploadToR2', { action: 'abort', upload_id, r2_key }).catch(() => {});
        throw new Error(chunkData.error || `Chunk ${partNumber} failed`);
      }

      parts.push({ part_number: partNumber, etag: chunkData.etag });
      const progress = Math.round(((i + 1) / totalChunks) * 95);
      updateJob(projectId, { r2Progress: progress });
    }

    // Step 3: Complete multipart upload
    const completeRes = await base44.functions.invoke('uploadToR2', {
      action: 'complete',
      upload_id,
      r2_key,
      parts,
    });
    const completeData = completeRes.data || completeRes;
    if (!completeData.success) throw new Error(completeData.error || 'Complete failed');

    updateJob(projectId, {
      r2Status: 'done',
      r2Url: completeData.url,
      r2Progress: 100,
    });
    console.log(`☁️ Uploaded to R2: ${completeData.url} (${sizeMB}MB, ${totalChunks} chunks)`);
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