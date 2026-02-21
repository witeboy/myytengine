import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight, Edit, X, Users } from 'lucide-react';

const UGC_TEMPLATES = [
  {
    id: 'skincare_unbox',
    name: 'Skincare Unboxing',
    emoji: '✨',
    influencerType: 'beauty_guru',
    typeLabel: 'Beauty / Skincare Guru',
    audience: 'Women 18-35 interested in skincare routines',
    demography: 'Urban millennials & Gen Z, middle income',
    market: 'US, UK, Canada',
    action: 'Unboxing a new skincare product, showing texture close-ups, applying to face, genuine reaction to smell and feel, natural lighting in bathroom',
    color: 'from-pink-400 to-rose-500',
  },
  {
    id: 'fitness_routine',
    name: 'Workout Routine',
    emoji: '💪',
    influencerType: 'fitness_coach',
    typeLabel: 'Fitness Coach',
    audience: 'Men & women 20-40 into home fitness',
    demography: 'Health-conscious, active lifestyle',
    market: 'US, Australia, UK',
    action: 'Demonstrating a quick 5-minute morning workout routine, speaking to camera between exercises, energetic and motivating, gym or living room setting',
    color: 'from-orange-400 to-red-500',
  },
  {
    id: 'tech_review',
    name: 'Gadget Review',
    emoji: '📱',
    influencerType: 'tech_reviewer',
    typeLabel: 'Tech Reviewer',
    audience: 'Tech enthusiasts 18-45',
    demography: 'Early adopters, higher income bracket',
    market: 'US, Europe, India',
    action: 'Hands-on review of a new gadget, close-up shots of the product, comparing features, honest pros and cons, desk setup background',
    color: 'from-blue-400 to-cyan-500',
  },
  {
    id: 'recipe_quick',
    name: 'Quick Recipe',
    emoji: '🍳',
    influencerType: 'food_creator',
    typeLabel: 'Food / Recipe Creator',
    audience: 'Home cooks 25-45 looking for fast meals',
    demography: 'Busy professionals, families',
    market: 'US, UK, Canada',
    action: 'Making a 3-ingredient recipe, overhead shots of ingredients, step-by-step cooking, final plating reveal, kitchen setting',
    color: 'from-amber-400 to-orange-500',
  },
  {
    id: 'travel_vlog',
    name: 'Travel Highlight',
    emoji: '✈️',
    influencerType: 'travel',
    typeLabel: 'Travel Content',
    audience: 'Adventure seekers 20-40',
    demography: 'Young professionals, digital nomads',
    market: 'Global, English-speaking',
    action: 'Exploring a scenic destination, walking through streets, trying local food, sunset shot, speaking to camera with excitement',
    color: 'from-teal-400 to-emerald-500',
  },
  {
    id: 'fashion_haul',
    name: 'Fashion Haul',
    emoji: '👗',
    influencerType: 'fashion',
    typeLabel: 'Fashion Influencer',
    audience: 'Fashion-forward women 18-35',
    demography: 'Style-conscious, mid to high income',
    market: 'US, UK, Europe',
    action: 'Try-on haul of new clothing items, mirror shots, outfit transitions, honest opinions on fit and quality, bedroom or closet setting',
    color: 'from-purple-400 to-pink-500',
  },
];

export default function UGCTemplates({ onSelectTemplate }) {
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});

  const handleEdit = (t) => {
    setEditing(t.id);
    setEditData({ ...t });
  };

  const handleApply = () => {
    onSelectTemplate(editData);
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-600">Quick Start Templates</h3>
      {editing ? (
        <Card className="border-pink-300">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Customize: {editData.name}</p>
              <Button size="icon" variant="ghost" onClick={() => setEditing(null)}><X className="w-4 h-4" /></Button>
            </div>
            <Input value={editData.audience} onChange={e => setEditData(d => ({ ...d, audience: e.target.value }))} placeholder="Target audience" />
            <Input value={editData.demography} onChange={e => setEditData(d => ({ ...d, demography: e.target.value }))} placeholder="Demography" />
            <Input value={editData.market} onChange={e => setEditData(d => ({ ...d, market: e.target.value }))} placeholder="Market" />
            <Textarea value={editData.action} onChange={e => setEditData(d => ({ ...d, action: e.target.value }))} placeholder="What the influencer does..." className="min-h-[80px]" />
            <Button onClick={handleApply} className="w-full bg-pink-600 hover:bg-pink-700 gap-2">
              Use Template <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {UGC_TEMPLATES.map(t => (
            <Card key={t.id} className="group hover:shadow-md transition-all cursor-pointer overflow-hidden" onClick={() => onSelectTemplate(t)}>
              <div className={`h-1.5 bg-gradient-to-r ${t.color}`} />
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{t.emoji}</span>
                  <p className="text-xs font-semibold">{t.name}</p>
                </div>
                <p className="text-[10px] text-gray-500 mb-2 line-clamp-2">{t.action}</p>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[9px]">{t.typeLabel}</Badge>
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); handleEdit(t); }}>
                    <Edit className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}