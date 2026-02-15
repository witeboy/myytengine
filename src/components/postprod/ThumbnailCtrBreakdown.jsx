import React from 'react';
import { Badge } from '@/components/ui/badge';

const CATEGORIES = [
  { key: 'visual_appeal', label: 'Visual', icon: '🎨' },
  { key: 'text_clarity', label: 'Text', icon: '🔤' },
  { key: 'emotional_impact', label: 'Emotion', icon: '💥' },
  { key: 'subject_focus', label: 'Focus', icon: '🎯' },
  { key: 'scroll_stop_power', label: 'Scroll-Stop', icon: '🛑' },
  { key: 'aspect_ratio_ok', label: '16:9', icon: '📐' },
];

function scoreColor(score) {
  if (score >= 8) return 'bg-green-100 text-green-800';
  if (score >= 6) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

export default function ThumbnailCtrBreakdown({ ctr }) {
  if (!ctr) return null;

  return (
    <div className="space-y-2 border-t pt-2">
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map(({ key, label, icon }) => {
          const cat = ctr[key];
          if (!cat) return null;
          return (
            <Badge
              key={key}
              className={`text-[10px] gap-0.5 ${scoreColor(cat.score)}`}
              title={cat.reason}
            >
              {icon} {label}: {cat.score}
            </Badge>
          );
        })}
      </div>
      {ctr.ctr_summary && (
        <p className="text-xs text-gray-600">{ctr.ctr_summary}</p>
      )}
      {ctr.improvement_tips && ctr.improvement_tips.length > 0 && (
        <div className="text-xs text-gray-500">
          {ctr.improvement_tips.map((tip, i) => (
            <p key={i} className="flex gap-1">
              <span className="text-amber-500">💡</span> {tip}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}