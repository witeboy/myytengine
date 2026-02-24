import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Palette, Check } from 'lucide-react';

const STYLES = [
  { id: 'cinematic_realistic', label: 'Cinematic Realistic', desc: 'Hollywood-grade cinematic look with dramatic lighting', emoji: '🎬' },
  { id: 'photorealistic_4k', label: 'Photorealistic 4K', desc: 'Ultra-realistic photography, sharp detail', emoji: '📸' },
  { id: 'cinematic_anime', label: 'Cinematic Anime', desc: 'Anime style with cinematic composition and lighting', emoji: '⚔️' },
  { id: 'anime', label: 'Anime', desc: 'Classic anime/manga illustration style', emoji: '🎌' },
  { id: 'cartoon_2d', label: '2D Cartoon', desc: 'Flat 2D cartoon with bold colors and outlines', emoji: '🖍️' },
  { id: 'picstory_cocomelon', label: 'PicStory / Cocomelon', desc: '3D rendered children\'s animation style', emoji: '🧸' },
  { id: 'cinematic_picstory', label: 'Cinematic PicStory', desc: 'Cinematic 3D animation like Pixar/DreamWorks', emoji: '✨' },
  { id: 'oil_painting', label: 'Oil Painting', desc: 'Classical oil painting style with rich textures', emoji: '🎨' },
  { id: 'watercolor', label: 'Watercolor', desc: 'Soft watercolor illustration style', emoji: '💧' },
  { id: 'comic_book', label: 'Comic Book', desc: 'Bold comic book panels with halftone effects', emoji: '💥' },
  { id: 'humpty_dumpty', label: 'Humpty Dumpty', desc: 'Minimalist stick-figure cartoon with circle heads & flat colors', emoji: '🥚' },
  { id: 'harry_potter', label: 'Harry Potter', desc: 'Dark whimsical illustration with teal atmosphere & gothic charm', emoji: '🧙' },
  { id: '3d_whiteboard_cartoon', label: '3D Whiteboard Cartoon', desc: 'Clean cartoon outlines, bright flat colors, isometric depth, explainer style', emoji: '🖊️' },
];

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