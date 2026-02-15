import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wand2, MessageSquare } from 'lucide-react';

const QUICK_SUGGESTIONS = [
  "Make the text bigger and bolder",
  "Make the subject look more intense/serious",
  "Change background to darker, moodier tone",
  "Add more contrast and saturation",
  "Make it more cinematic with rim lighting",
  "Simplify — fewer elements, more focus",
  "Make the expression more shocked/surprised",
  "Change text to something more curiosity-driven",
];

export default function RefineConceptDialog({ thumb, open, onOpenChange, onRefined }) {
  const [feedback, setFeedback] = useState('');
  const [refining, setRefining] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);

  const handleRefine = async () => {
    if (!feedback.trim()) return;
    setRefining(true);
    setResult(null);
    const res = await base44.functions.invoke('refineThumbnailConcept', {
      thumbnail_id: thumb.id,
      feedback: feedback.trim(),
    });
    setResult(res.data);
    setRefining(false);
    if (res.data.success && res.data.updated_prompt) {
      // Auto-generate the new image immediately
      setGenerating(true);
      const { url } = await base44.integrations.Core.GenerateImage({
        prompt: `16:9 aspect ratio, 1280x720, widescreen landscape YouTube thumbnail. ${res.data.updated_prompt}`,
      });
      await base44.entities.ThumbnailConcepts.update(thumb.id, { image_url: url });
      setGenerating(false);
      onRefined();
    }
  };

  const handleClose = () => {
    setFeedback('');
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-purple-600" />
            Refine Concept #{thumb?.rank}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current concept summary */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <p className="text-xs font-medium text-gray-500">Current concept</p>
            <p className="text-sm line-clamp-2">{thumb?.concept_description}</p>
            {thumb?.text_overlay && (
              <Badge variant="secondary" className="text-xs">"{thumb.text_overlay}"</Badge>
            )}
          </div>

          {/* Quick suggestions */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Quick suggestions</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="text-xs px-2.5 py-1.5 rounded-full bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors border border-purple-200"
                  onClick={() => setFeedback(prev => prev ? `${prev}. ${s}` : s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback input */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">
              <MessageSquare className="w-3 h-3 inline mr-1" />
              Your refinement instructions
            </p>
            <Textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="e.g. Make the text bigger, change background to dark blue, make the subject look more shocked..."
              className="min-h-[80px] text-sm"
            />
          </div>

          {/* Result */}
          {result && result.success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs font-medium text-green-700 mb-1">Changes applied:</p>
              <p className="text-sm text-green-800">{result.changes_made}</p>
              <p className="text-xs text-green-600 mt-1">Image cleared — click "Generate" to see the updated thumbnail.</p>
            </div>
          )}

          {result && !result.success && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{result.error || 'Something went wrong'}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={handleRefine}
              disabled={refining || !feedback.trim()}
              className="flex-1 gap-2 bg-purple-600 hover:bg-purple-700"
            >
              {refining ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              {refining ? 'Refining...' : 'Refine Concept'}
            </Button>
            <Button variant="outline" onClick={handleClose}>
              {result?.success ? 'Done' : 'Cancel'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}