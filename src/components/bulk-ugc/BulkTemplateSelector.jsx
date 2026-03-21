import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';

const LIFESTYLE_TEMPLATES = [
  { id: 'skincare_unbox', name: 'Skincare Unboxing', emoji: '✨', influencerType: 'beauty_guru', typeLabel: 'Beauty / Skincare Guru', audience: 'Women 18-35 interested in skincare routines', demography: 'Urban millennials & Gen Z, middle income', market: 'US, UK, Canada', action: 'Unboxing a new skincare product, showing texture close-ups, applying to face, genuine reaction to smell and feel, natural lighting in bathroom', color: 'from-pink-400 to-rose-500' },
  { id: 'fitness_routine', name: 'Workout Routine', emoji: '💪', influencerType: 'fitness_coach', typeLabel: 'Fitness Coach', audience: 'Men & women 20-40 into home fitness', demography: 'Health-conscious, active lifestyle', market: 'US, Australia, UK', action: 'Demonstrating a quick 5-minute morning workout routine, speaking to camera between exercises, energetic and motivating', color: 'from-orange-400 to-red-500' },
  { id: 'tech_review', name: 'Gadget Review', emoji: '📱', influencerType: 'tech_reviewer', typeLabel: 'Tech Reviewer', audience: 'Tech enthusiasts 18-45', demography: 'Early adopters, higher income bracket', market: 'US, Europe, India', action: 'Hands-on review of a new gadget, close-up shots of the product, comparing features, honest pros and cons', color: 'from-blue-400 to-cyan-500' },
  { id: 'recipe_quick', name: 'Quick Recipe', emoji: '🍳', influencerType: 'food_creator', typeLabel: 'Food / Recipe Creator', audience: 'Home cooks 25-45 looking for fast meals', demography: 'Busy professionals, families', market: 'US, UK, Canada', action: 'Making a 3-ingredient recipe, overhead shots of ingredients, step-by-step cooking, final plating reveal', color: 'from-amber-400 to-orange-500' },
  { id: 'travel_vlog', name: 'Travel Highlight', emoji: '✈️', influencerType: 'travel', typeLabel: 'Travel Content', audience: 'Adventure seekers 20-40', demography: 'Young professionals, digital nomads', market: 'Global, English-speaking', action: 'Exploring a scenic destination, walking through streets, trying local food, sunset shot', color: 'from-teal-400 to-emerald-500' },
  { id: 'fashion_haul', name: 'Fashion Haul', emoji: '👗', influencerType: 'fashion', typeLabel: 'Fashion Influencer', audience: 'Fashion-forward women 18-35', demography: 'Style-conscious, mid to high income', market: 'US, UK, Europe', action: 'Try-on haul of new clothing items, mirror shots, outfit transitions, honest opinions on fit and quality', color: 'from-purple-400 to-pink-500' },
];

const SAAS_TEMPLATES = [
  { id: 'saas_first_impressions', name: 'First Impressions Review', emoji: '🆕', influencerType: 'tech_reviewer', typeLabel: 'Tech Reviewer', audience: 'SaaS early adopters 25-45', demography: 'Knowledge workers, freelancers', market: 'US, UK, Global', action: 'Reacting to a SaaS product for the first time, face-to-camera intro, screen recording, reaction shots', color: 'from-blue-500 to-indigo-600' },
  { id: 'saas_roi_testimonial', name: 'ROI Testimonial', emoji: '💰', influencerType: 'business', typeLabel: 'Business / Finance', audience: 'Business owners 30-55', demography: 'Entrepreneurs, C-suite', market: 'US, UK, Global', action: 'Real business owner sharing specific results and ROI metrics', color: 'from-green-500 to-emerald-600' },
  { id: 'saas_problem_solution', name: 'Problem-Solution Story', emoji: '😤', influencerType: 'lifestyle', typeLabel: 'Lifestyle / Vlogger', audience: 'Professionals 22-45', demography: 'Small teams, freelancers', market: 'US, UK, Canada', action: 'Starting with relatable pain point, building frustration, then revealing solution', color: 'from-red-500 to-orange-600' },
  { id: 'saas_quick_setup', name: 'Quick Setup Guide', emoji: '⚡', influencerType: 'education', typeLabel: 'Education / How-to', audience: 'New users 20-50', demography: 'Non-technical users', market: 'US, UK, Global', action: 'Getting started in under 5 minutes with step-by-step walkthrough', color: 'from-yellow-400 to-orange-500' },
  { id: 'saas_app_launch', name: 'App Launch Hype', emoji: '🚀', influencerType: 'tech_reviewer', typeLabel: 'Tech Reviewer', audience: 'Early adopters 20-40', demography: 'Product Hunt crowd', market: 'US, Global', action: 'Building excitement for new product launch with teaser and feature preview', color: 'from-orange-500 to-red-600' },
  { id: 'saas_ai_tool', name: 'AI Tool Demo', emoji: '🤖', influencerType: 'tech_reviewer', typeLabel: 'Tech Reviewer', audience: 'AI-curious professionals 22-45', demography: 'Early adopters', market: 'US, Global', action: 'Demonstrating AI capabilities and practical applications', color: 'from-violet-500 to-indigo-600' },
];

const ALL_TEMPLATES = [...LIFESTYLE_TEMPLATES, ...SAAS_TEMPLATES];

export { ALL_TEMPLATES };

export default function BulkTemplateSelector({ selectedIds, onToggle }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-600">Select Templates</h3>
        <Badge variant="outline">{selectedIds.length} selected</Badge>
      </div>

      <p className="text-xs text-gray-400">Lifestyle & Consumer</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {LIFESTYLE_TEMPLATES.map(t => (
          <TemplateCard key={t.id} template={t} selected={selectedIds.includes(t.id)} onToggle={() => onToggle(t.id)} />
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-4">SaaS & Business</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {SAAS_TEMPLATES.map(t => (
          <TemplateCard key={t.id} template={t} selected={selectedIds.includes(t.id)} onToggle={() => onToggle(t.id)} />
        ))}
      </div>
    </div>
  );
}

function TemplateCard({ template, selected, onToggle }) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md overflow-hidden ${selected ? 'ring-2 ring-indigo-500 shadow-md' : ''}`}
      onClick={onToggle}
    >
      <div className={`h-1 bg-gradient-to-r ${template.color}`} />
      <CardContent className="p-2.5 relative">
        {selected && (
          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-base">{template.emoji}</span>
          <p className="text-[11px] font-semibold truncate">{template.name}</p>
        </div>
        <Badge variant="outline" className="text-[9px]">{template.typeLabel}</Badge>
      </CardContent>
    </Card>
  );
}