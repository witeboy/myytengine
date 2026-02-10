import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

export default function StepProgress({ currentStep }) {
  const steps = [
    { num: 1, label: 'Topics' },
    { num: 2, label: 'Duration' },
    { num: 3, label: 'Outline' },
    { num: 4, label: 'Script' },
    { num: 5, label: 'Hooks' },
    { num: 6, label: 'Edit' },
    { num: 7, label: 'Retention' },
    { num: 8, label: 'Outro' },
    { num: 9, label: 'Voice' },
    { num: 10, label: 'Visuals' },
    { num: 11, label: 'Assets' },
    { num: 12, label: 'Timing' },
    { num: 13, label: 'Thumbs' },
    { num: 14, label: 'Upload' },
    { num: 15, label: 'Calendar' },
  ];

  return (
    <div className="bg-white border-b">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
          {steps.map((step, idx) => (
            <div key={step.num} className="flex items-center gap-1 flex-shrink-0">
              <div className="text-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold ${
                  currentStep >= step.num
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {currentStep > step.num ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    step.num
                  )}
                </div>
                <div className="text-xs text-gray-600 mt-1 whitespace-nowrap">{step.label}</div>
              </div>
              {idx < steps.length - 1 && (
                <div className={`h-0.5 w-3 ${currentStep > step.num ? 'bg-blue-600' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}