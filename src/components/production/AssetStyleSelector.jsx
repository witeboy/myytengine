import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const ASSET_STYLES = [
  { id: 'anime', label: 'Anime', icon: '🎨' },
  { id: 'photorealistic', label: 'Photorealistic', icon: '📷' },
  { id: 'cartoon', label: 'Cartoon', icon: '🎭' },
  { id: 'oil_colour', label: 'Oil Color', icon: '🖼️' },
  { id: 'retro_classic', label: 'Retro Classic', icon: '🎬' },
  { id: 'black_and_white', label: 'B&W', icon: '⚫' },
  { id: '60s', label: '60s', icon: '☮️' },
  { id: '90s', label: '90s', icon: '💻' },
  { id: 'medieval', label: 'Medieval', icon: '🏰' },
];

export default function AssetStyleSelector({ selectedStyle, onStyleSelect }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Visual Style</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {ASSET_STYLES.map(style => (
            <Button
              key={style.id}
              variant={selectedStyle === style.id ? 'default' : 'outline'}
              onClick={() => onStyleSelect(style.id)}
              className="flex flex-col items-center gap-1 h-auto py-3"
            >
              <span className="text-xl">{style.icon}</span>
              <span className="text-xs text-center">{style.label}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}