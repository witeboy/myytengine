// ══════════════════════════════════════════════════════════════════
// ImageStyleSelector.jsx
// Select Demographics, Profession, and Framing for Thumbnail Images
// ══════════════════════════════════════════════════════════════════
// Place in: src/components/postprod/ImageStyleSelector.jsx
// ══════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  User, Briefcase, Camera, ChevronDown, Check, Shuffle
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// STYLE OPTIONS
// ══════════════════════════════════════════════════════════════════

const DEMOGRAPHICS = [
  { id: 'young_male', label: 'Young Male (20s)', icon: '👨' },
  { id: 'young_female', label: 'Young Female (20s)', icon: '👩' },
  { id: 'male_30s', label: 'Male (30s)', icon: '🧔' },
  { id: 'female_30s', label: 'Female (30s)', icon: '👩‍💼' },
  { id: 'mature_male', label: 'Mature Male (40s+)', icon: '👨‍🦳' },
  { id: 'mature_female', label: 'Mature Female (40s+)', icon: '👩‍🦳' }
];

const PROFESSIONS = [
  { id: 'developer', label: 'Developer/Tech', icon: '💻', desc: 'Hoodie, casual tech vibe' },
  { id: 'banker', label: 'Banker/Finance', icon: '💼', desc: 'Suit, tie, Wall Street look' },
  { id: 'entrepreneur', label: 'Entrepreneur', icon: '🚀', desc: 'Smart casual, startup founder' },
  { id: 'creator', label: 'Content Creator', icon: '🎬', desc: 'Trendy, studio background' },
  { id: 'stay_at_home_parent', label: 'Stay-at-Home Parent', icon: '🏠', desc: 'Casual, home setting' },
  { id: 'student', label: 'Student', icon: '📚', desc: 'Youthful, university vibe' },
  { id: 'fitness', label: 'Fitness/Health', icon: '💪', desc: 'Athletic wear, gym setting' },
  { id: 'corporate', label: 'Corporate Executive', icon: '🏢', desc: 'Premium suit, corner office' },
  { id: 'creative', label: 'Creative/Artist', icon: '🎨', desc: 'Artistic, eclectic style' },
  { id: 'casual', label: 'Casual/Everyday', icon: '👕', desc: 'Relatable everyday person' }
];

const FRAMING = [
  { id: 'face_closeup', label: 'Face Close-up', icon: '😃', desc: 'Extreme close-up, 60% of frame' },
  { id: 'head_shoulders', label: 'Head & Shoulders', icon: '👤', desc: 'Classic YouTube thumbnail' },
  { id: 'upper_body', label: 'Upper Body', icon: '🧍', desc: 'Waist up, room for gestures' },
  { id: 'full_body', label: 'Full Body', icon: '🚶', desc: 'Full body, lifestyle context' },
  { id: 'side_profile', label: 'Side Profile', icon: '👤', desc: 'Dramatic side view' },
  { id: 'over_shoulder', label: 'Over Shoulder', icon: '📷', desc: 'POV, looking at something' }
];

const NICHES = [
  { id: 'finance', label: 'Finance', icon: '💰', color: 'bg-green-100 text-green-700' },
  { id: 'true_crime', label: 'True Crime', icon: '🔍', color: 'bg-red-100 text-red-700' },
  { id: 'love_story', label: 'Love Story', icon: '❤️', color: 'bg-pink-100 text-pink-700' },
  { id: 'technology', label: 'Technology', icon: '🤖', color: 'bg-blue-100 text-blue-700' },
  { id: 'explainer', label: 'Explainer', icon: '💡', color: 'bg-yellow-100 text-yellow-700' },
  { id: 'diy', label: 'DIY', icon: '🔧', color: 'bg-orange-100 text-orange-700' },
  { id: 'vlog', label: 'Vlog', icon: '📹', color: 'bg-purple-100 text-purple-700' },
  { id: 'events', label: 'Events', icon: '🎉', color: 'bg-indigo-100 text-indigo-700' },
  { id: 'travel', label: 'Travel', icon: '✈️', color: 'bg-cyan-100 text-cyan-700' }
];

// ══════════════════════════════════════════════════════════════════
// SELECTION GRID
// ══════════════════════════════════════════════════════════════════

function SelectionGrid({ title, icon: Icon, options, selected, onSelect, showDesc = false }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-500" />
          <span className="font-semibold text-sm text-gray-700">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {options.find(o => o.id === selected)?.label || 'None'}
          </Badge>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="grid grid-cols-2 gap-2">
          {options.map(option => (
            <button
              key={option.id}
              onClick={() => onSelect(option.id)}
              className={`text-left p-2.5 rounded-lg border transition-all ${
                selected === option.id
                  ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500'
                  : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{option.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${
                    selected === option.id ? 'text-purple-700' : 'text-gray-700'
                  }`}>
                    {option.label}
                  </p>
                  {showDesc && option.desc && (
                    <p className="text-[10px] text-gray-400 truncate">{option.desc}</p>
                  )}
                </div>
                {selected === option.id && (
                  <Check className="w-4 h-4 text-purple-500 shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// NICHE SELECTOR (Horizontal Pills)
// ══════════════════════════════════════════════════════════════════

function NicheSelector({ selected, onSelect }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm text-gray-700">Content Niche</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {NICHES.map(niche => (
          <button
            key={niche.id}
            onClick={() => onSelect(niche.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              selected === niche.id
                ? `${niche.color} ring-2 ring-offset-1 ring-purple-400`
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {niche.icon} {niche.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════

export default function ImageStyleSelector({ 
  value = {}, 
  onChange,
  showNiche = true,
  className = '' 
}) {
  const [demographic, setDemographic] = useState(value.demographic || 'young_male');
  const [profession, setProfession] = useState(value.profession || 'casual');
  const [framing, setFraming] = useState(value.framing || 'head_shoulders');
  const [niche, setNiche] = useState(value.niche || 'explainer');

  // Notify parent on change
  useEffect(() => {
    if (onChange) {
      onChange({ demographic, profession, framing, niche });
    }
  }, [demographic, profession, framing, niche]);

  // Random selection
  const handleRandomize = () => {
    setDemographic(DEMOGRAPHICS[Math.floor(Math.random() * DEMOGRAPHICS.length)].id);
    setProfession(PROFESSIONS[Math.floor(Math.random() * PROFESSIONS.length)].id);
    setFraming(FRAMING[Math.floor(Math.random() * FRAMING.length)].id);
    if (showNiche) {
      setNiche(NICHES[Math.floor(Math.random() * NICHES.length)].id);
    }
  };

  // Get current selection summary
  const getSummary = () => {
    const d = DEMOGRAPHICS.find(o => o.id === demographic);
    const p = PROFESSIONS.find(o => o.id === profession);
    const f = FRAMING.find(o => o.id === framing);
    return `${d?.icon || ''} ${d?.label || ''} • ${p?.icon || ''} ${p?.label || ''} • ${f?.icon || ''} ${f?.label || ''}`;
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">Image Style</CardTitle>
              <p className="text-xs text-gray-500">Customize thumbnail subject</p>
            </div>
          </div>
          
          <Button
            size="sm"
            variant="outline"
            onClick={handleRandomize}
            className="gap-1.5 text-xs h-8"
          >
            <Shuffle className="w-3.5 h-3.5" />
            Random
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Niche */}
        {showNiche && (
          <NicheSelector selected={niche} onSelect={setNiche} />
        )}

        {/* Demographic */}
        <SelectionGrid
          title="Demographics"
          icon={User}
          options={DEMOGRAPHICS}
          selected={demographic}
          onSelect={setDemographic}
        />

        {/* Profession */}
        <SelectionGrid
          title="Profession/Style"
          icon={Briefcase}
          options={PROFESSIONS}
          selected={profession}
          onSelect={setProfession}
          showDesc={true}
        />

        {/* Framing */}
        <SelectionGrid
          title="Camera Framing"
          icon={Camera}
          options={FRAMING}
          selected={framing}
          onSelect={setFraming}
          showDesc={true}
        />

        {/* Summary */}
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Selected Style:</p>
          <p className="text-sm text-gray-700">{getSummary()}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════
// COMPACT INLINE VERSION
// ══════════════════════════════════════════════════════════════════

export function ImageStyleSelectorCompact({ value = {}, onChange }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState({
    demographic: value.demographic || 'young_male',
    profession: value.profession || 'casual',
    framing: value.framing || 'head_shoulders',
    niche: value.niche || 'explainer'
  });

  const handleChange = (updates) => {
    const newStyle = { ...style, ...updates };
    setStyle(newStyle);
    if (onChange) onChange(newStyle);
  };

  const d = DEMOGRAPHICS.find(o => o.id === style.demographic);
  const p = PROFESSIONS.find(o => o.id === style.profession);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 border rounded-lg hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-700">
            {d?.icon} {d?.label?.split(' ')[0]} • {p?.icon} {p?.label?.split('/')[0]}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50">
          <ImageStyleSelector
            value={style}
            onChange={handleChange}
            showNiche={false}
            className="shadow-xl"
          />
        </div>
      )}
    </div>
  );
}
