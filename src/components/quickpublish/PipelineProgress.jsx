import React from 'react';
import { Check, Loader2, Circle } from 'lucide-react';

const STEPS = [
  { key: 'upload', label: 'Upload Video' },
  { key: 'transcribe', label: 'Transcribe (ASR)' },
  { key: 'seo', label: 'Generate SEO' },
  { key: 'thumbnails', label: 'Generate Thumbnails' },
  { key: 'publish', label: 'Publish' },
];

export default function PipelineProgress({ currentStep, completedSteps }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {STEPS.map((step, i) => {
        const isCompleted = completedSteps.includes(step.key);
        const isCurrent = currentStep === step.key;
        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div className={`h-px flex-1 min-w-4 ${isCompleted ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isCompleted ? (
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-white" />
                </div>
              ) : isCurrent ? (
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                  <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                  <Circle className="w-3 h-3 text-gray-400" />
                </div>
              )}
              <span className={`text-xs font-medium ${
                isCompleted ? 'text-green-700' : isCurrent ? 'text-blue-700' : 'text-gray-400'
              }`}>
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}