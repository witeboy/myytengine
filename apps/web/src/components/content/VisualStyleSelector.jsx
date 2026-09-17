import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Palette, Check } from 'lucide-react';
import catalogue from '@shared/visual-styles.json';

// The styles come from shared/visual-styles.json — the same file the prompt engines read.
// This list used to be maintained separately, which shipped cards no engine knew about
// (B-Roll Only did nothing) and cards for styles the project mode sets on its own.
const STYLES = catalogue.styles.filter(s => s.pickable);

export default function VisualStyleSelector({ selectedStyle, onSelect }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Palette className="w-5 h-5 text-purple-600" />
        <h3 className="font-semibold text-lg">Visual Style</h3>
      </div>
      <p className="text-sm text-gray-500 mb-4">Choose a consistent visual style for all generated images in this project</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {STYLES.map(style => {
          const isSelected = selectedStyle === style.id;
          return (
            <Card
              key={style.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                isSelected ? 'ring-2 ring-purple-500 bg-purple-50' : 'hover:bg-gray-50'
              }`}
              onClick={() => onSelect(style.id)}
            >
              <CardContent className="p-3 text-center relative">
                {isSelected && (
                  <div className="absolute top-1.5 right-1.5">
                    <Check className="w-4 h-4 text-purple-600" />
                  </div>
                )}
                <div className="text-2xl mb-1">{style.emoji}</div>
                <p className="text-sm font-medium leading-tight">{style.label}</p>
                <p className="text-[10px] text-gray-500 mt-1 leading-tight">{style.desc}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
