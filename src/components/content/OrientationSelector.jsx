import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Monitor, Smartphone, Check } from 'lucide-react';

const ORIENTATIONS = [
  {
    id: 'landscape',
    label: 'Landscape (16:9)',
    desc: 'YouTube, TV, Desktop — horizontal widescreen',
    icon: Monitor,
    ratio: '16:9',
    preview: 'w-16 h-9',
  },
  {
    id: 'portrait',
    label: 'Portrait (9:16)',
    desc: 'TikTok, Reels, Shorts — vertical mobile',
    icon: Smartphone,
    ratio: '9:16',
    preview: 'w-9 h-16',
  },
];

export default function OrientationSelector({ selectedOrientation, onSelect }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Monitor className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold text-lg">Video Orientation</h3>
      </div>
      <p className="text-sm text-gray-500 mb-4">Choose the aspect ratio for all generated content in this project</p>
      <div className="grid grid-cols-2 gap-4 max-w-md">
        {ORIENTATIONS.map(o => {
          const isSelected = selectedOrientation === o.id;
          const Icon = o.icon;
          return (
            <Card
              key={o.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50'
              }`}
              onClick={() => onSelect(o.id)}
            >
              <CardContent className="p-4 flex flex-col items-center text-center relative">
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-blue-600" />
                  </div>
                )}
                <div className={`${o.preview} bg-gradient-to-br from-gray-300 to-gray-400 rounded border border-gray-400 mb-3 flex items-center justify-center`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <p className="text-sm font-semibold">{o.label}</p>
                <p className="text-[11px] text-gray-500 mt-1 leading-tight">{o.desc}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}