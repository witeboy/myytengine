import React, { useState, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Layers, Play, ArrowLeft, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import BulkTemplateSelector, { ALL_TEMPLATES } from '../components/bulk-ugc/BulkTemplateSelector';
import BulkProductUploader from '../components/bulk-ugc/BulkProductUploader';
import BulkQueueManager from '../components/bulk-ugc/BulkQueueManager';
import BulkResultsGrid from '../components/bulk-ugc/BulkResultsGrid';

const MAX_CONCURRENT = 3;

export default function BulkUGCPipeline() {
  const [selectedTemplateIds, setSelectedTemplateIds] = useState([]);
  const [productImages, setProductImages] = useState([]);
  const [queue, setQueue] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const activeCountRef = useRef(0);
  const queueRef = useRef([]);

  const toggleTemplate = (id) => {
    setSelectedTemplateIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Build all combinations of template × product image
  const buildQueue = () => {
    const jobs = [];
    for (const templateId of selectedTemplateIds) {
      const template = ALL_TEMPLATES.find(t => t.id === templateId);
      if (!template) continue;
      for (const product of productImages) {
        jobs.push({
          id: `${templateId}_${product.name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          templateId: template.id,
          templateName: template.name,
          templateEmoji: template.emoji,
          templateAction: template.action,
          templateType: template.influencerType,
          productName: product.name,
          productUrl: product.url,
          status: 'pending',
          result_url: null,
          error: null,
        });
      }
    }
    return jobs;
  };

  const updateJob = useCallback((jobId, updates) => {
    setQueue(prev => prev.map(j => j.id === jobId ? { ...j, ...updates } : j));
    queueRef.current = queueRef.current.map(j => j.id === jobId ? { ...j, ...updates } : j);
  }, []);

  const processNextJob = useCallback(async () => {
    // Find next pending job
    const next = queueRef.current.find(j => j.status === 'pending');
    if (!next || activeCountRef.current >= MAX_CONCURRENT) return;

    activeCountRef.current++;
    updateJob(next.id, { status: 'generating' });

    try {
      const prompt = buildImagePrompt(next);
      const result = await base44.integrations.Core.GenerateImage({
        prompt,
        existing_image_urls: [next.productUrl],
      });

      updateJob(next.id, { status: 'completed', result_url: result.url });
    } catch (err) {
      console.error('Generation failed for', next.id, err);
      updateJob(next.id, { status: 'failed', error: err.message || 'Generation failed' });
    }

    activeCountRef.current--;

    // Check if more jobs to process
    const remaining = queueRef.current.find(j => j.status === 'pending');
    if (remaining) {
      processNextJob();
    } else if (activeCountRef.current === 0) {
      setIsRunning(false);
    }
  }, [updateJob]);

  const startBulkGeneration = () => {
    const jobs = buildQueue();
    if (jobs.length === 0) return;

    setQueue(jobs);
    queueRef.current = jobs;
    setIsRunning(true);
    activeCountRef.current = 0;

    // Start up to MAX_CONCURRENT parallel jobs
    for (let i = 0; i < Math.min(MAX_CONCURRENT, jobs.length); i++) {
      processNextJob();
    }
  };

  const handleApprove = (jobId) => updateJob(jobId, { status: 'approved' });
  const handleReject = (jobId) => updateJob(jobId, { status: 'rejected' });

  const handleRegenerate = useCallback(async (jobId) => {
    const job = queueRef.current.find(j => j.id === jobId);
    if (!job) return;

    updateJob(jobId, { status: 'generating', result_url: null, error: null });

    try {
      const prompt = buildImagePrompt(job);
      const result = await base44.integrations.Core.GenerateImage({
        prompt,
        existing_image_urls: [job.productUrl],
      });
      updateJob(jobId, { status: 'completed', result_url: result.url });
    } catch (err) {
      updateJob(jobId, { status: 'failed', error: err.message || 'Regeneration failed' });
    }
  }, [updateJob]);

  const totalJobs = selectedTemplateIds.length * productImages.length;
  const approvedCount = queue.filter(j => j.status === 'approved').length;

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/UGCPipeline">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                Bulk UGC Mode
              </h1>
              <p className="text-xs text-gray-500">Generate multiple UGC images at once across templates & products</p>
            </div>
          </div>
          {approvedCount > 0 && (
            <Badge className="bg-green-100 text-green-700 text-sm px-3 py-1">
              <CheckCircle className="w-3.5 h-3.5 mr-1" />
              {approvedCount} approved
            </Badge>
          )}
        </div>

        {/* Setup section (hidden once generation starts) */}
        {queue.length === 0 && (
          <div className="space-y-6">
            <Card>
              <CardContent className="p-5">
                <BulkTemplateSelector
                  selectedIds={selectedTemplateIds}
                  onToggle={toggleTemplate}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <BulkProductUploader
                  images={productImages}
                  setImages={setProductImages}
                />
              </CardContent>
            </Card>

            {/* Summary & Launch */}
            {selectedTemplateIds.length > 0 && productImages.length > 0 && (
              <Card className="border-indigo-200 bg-indigo-50/50">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Ready to generate</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {selectedTemplateIds.length} template{selectedTemplateIds.length !== 1 ? 's' : ''} × {productImages.length} product{productImages.length !== 1 ? 's' : ''} = <span className="font-bold text-indigo-600">{totalJobs} images</span>
                      </p>
                    </div>
                    <Button
                      onClick={startBulkGeneration}
                      className="bg-indigo-600 hover:bg-indigo-700 gap-2"
                    >
                      <Play className="w-4 h-4" />
                      Generate All ({totalJobs})
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Running / Results */}
        {queue.length > 0 && (
          <div className="space-y-6">
            <BulkQueueManager queue={queue} />

            <BulkResultsGrid
              queue={queue}
              onApprove={handleApprove}
              onReject={handleReject}
              onRegenerate={handleRegenerate}
            />

            {/* Reset button */}
            {!isRunning && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => { setQueue([]); queueRef.current = []; }}
                  className="text-sm"
                >
                  Start New Batch
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function buildImagePrompt(job) {
  return `UGC-style social media content photo. A realistic influencer (${job.templateType}) is ${job.templateAction}. The product "${job.productName}" is prominently featured. Shot on iPhone, natural lighting, authentic social media aesthetic. High quality, photorealistic, vertical 9:16 format. No text overlays.`;
}