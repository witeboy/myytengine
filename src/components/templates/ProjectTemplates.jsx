import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowRight, Film, Clock, Palette } from 'lucide-react';

const TEMPLATES = [
  {
    id: 'true_crime',
    name: 'True Crime Mystery',
    niche: 'true crime',
    tone: 'dramatic',
    description: 'A gripping unsolved case narrative with dark, cinematic visuals and dramatic pacing.',
    visual_style: 'cinematic_realistic',
    orientation: 'landscape',
    duration: 15,
    scenes_count: 12,
    emoji: '🔍',
    color: 'from-red-500 to-red-700',
    tags: ['mystery', 'crime', 'documentary'],
    sample_scenes: [
      { narration: 'It was a cold November night when everything changed...', image_prompt: 'Dark foggy street at night, cinematic noir lighting, empty road' },
      { narration: 'The detective arrived at the scene at 2:47 AM.', image_prompt: 'Detective examining a crime scene under yellow tape, dramatic shadows' },
      { narration: 'But what they found next would shock even the most seasoned investigators.', image_prompt: 'Close-up of evidence markers on ground, blue and red police lights reflecting' },
    ],
  },
  {
    id: 'tech_explainer',
    name: 'Tech Explainer',
    niche: 'technology',
    tone: 'conversational',
    description: 'Engaging breakdown of a tech topic with clean, modern visuals and clear pacing.',
    visual_style: 'photorealistic_4k',
    orientation: 'landscape',
    duration: 10,
    scenes_count: 8,
    emoji: '💻',
    color: 'from-blue-500 to-cyan-600',
    tags: ['tech', 'explainer', 'educational'],
    sample_scenes: [
      { narration: 'You use it every single day, but have you ever wondered how it actually works?', image_prompt: 'Futuristic holographic interface floating in clean white space, photorealistic 4K' },
      { narration: 'Let me break it down in a way that actually makes sense.', image_prompt: 'Animated diagram of neural network nodes connecting, clean modern design' },
      { narration: 'And here is where it gets really interesting...', image_prompt: 'Close-up of microchip with data streams flowing, blue glow, cinematic' },
    ],
  },
  {
    id: 'history_epic',
    name: 'History Epic',
    niche: 'history',
    tone: 'dramatic',
    description: 'A sweeping historical narrative with oil-painting visuals and grand storytelling.',
    visual_style: 'oil_painting',
    orientation: 'landscape',
    duration: 20,
    scenes_count: 15,
    emoji: '⚔️',
    color: 'from-amber-600 to-yellow-700',
    tags: ['history', 'epic', 'documentary'],
    sample_scenes: [
      { narration: 'The year was 1347. And a shadow was about to fall across all of Europe.', image_prompt: 'Medieval European city at dusk, oil painting style, dramatic clouds, dark atmosphere' },
      { narration: 'No one could have predicted what would happen next.', image_prompt: 'Medieval ships arriving at harbor, oil painting style, stormy sea' },
      { narration: 'Within months, the world as they knew it would be unrecognizable.', image_prompt: 'Abandoned medieval village, overgrown, oil painting, melancholy golden hour' },
    ],
  },
  {
    id: 'horror_story',
    name: 'Horror Story',
    niche: 'horror',
    tone: 'dramatic',
    description: 'A spine-chilling short horror narrative with dark anime visuals.',
    visual_style: 'cinematic_anime',
    orientation: 'portrait',
    duration: 8,
    scenes_count: 6,
    emoji: '👻',
    color: 'from-gray-700 to-gray-900',
    tags: ['horror', 'scary', 'short'],
    sample_scenes: [
      { narration: 'She heard the footsteps again. But this time, they were inside the house.', image_prompt: 'Dark anime hallway with a shadowy figure at the end, horror style, flickering light' },
      { narration: 'The door was locked from the outside. She was sure of it.', image_prompt: 'Close-up of locked door handle, anime style, dark shadows, moonlight through window' },
      { narration: 'Then she looked in the mirror... and saw someone standing behind her.', image_prompt: 'Anime girl looking into mirror, dark figure behind her, horror, dramatic lighting' },
    ],
  },
  {
    id: 'science_docs',
    name: 'Science Documentary',
    niche: 'science',
    tone: 'educational',
    description: 'A visually stunning science documentary with photorealistic space and nature imagery.',
    visual_style: 'photorealistic_4k',
    orientation: 'landscape',
    duration: 12,
    scenes_count: 10,
    emoji: '🔬',
    color: 'from-purple-500 to-indigo-600',
    tags: ['science', 'space', 'nature', 'documentary'],
    sample_scenes: [
      { narration: 'Somewhere in the cosmos, a star is being born right now.', image_prompt: 'Nebula with a forming star, photorealistic, Hubble-like colors, deep space' },
      { narration: 'The forces at play are beyond anything we can truly comprehend.', image_prompt: 'Supernova explosion in deep space, photorealistic 4K, vibrant colors' },
      { narration: 'And yet, everything you see around you... started right there.', image_prompt: 'Overview of Earth from space, photorealistic, sun rising over the horizon' },
    ],
  },
  {
    id: 'kids_story',
    name: "Children's Story",
    niche: 'kids education',
    tone: 'conversational',
    description: 'A fun, colorful animated story for young audiences with cartoon visuals.',
    visual_style: 'picstory_cocomelon',
    orientation: 'landscape',
    duration: 5,
    scenes_count: 5,
    emoji: '🧸',
    color: 'from-pink-400 to-orange-400',
    tags: ['kids', 'education', 'cartoon', 'fun'],
    sample_scenes: [
      { narration: 'Once upon a time, in a land made entirely of candy...', image_prompt: 'Colorful candy land, cartoon style, bright colors, happy atmosphere, CoComelon style' },
      { narration: 'Lived a little bear named Benny who loved to explore!', image_prompt: 'Cute cartoon bear character with backpack, bright colorful forest, CoComelon style' },
      { narration: 'One day, Benny found a magical rainbow bridge!', image_prompt: 'Cartoon rainbow bridge over a sparkly river, magical forest, bright and cheerful' },
    ],
  },
];

export default function ProjectTemplates({ onSelectTemplate }) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(null);

  const handleSelect = async (template) => {
    setCreating(template.id);

    const project = await base44.entities.Projects.create({
      name: `${template.name} Project`,
      niche: template.niche,
      tone: template.tone,
      visual_style: template.visual_style,
      orientation: template.orientation,
      video_duration_minutes: template.duration,
      status: 'created',
      current_step: 0,
    });

    // Create sample scenes
    const sceneData = template.sample_scenes.map((s, i) => ({
      project_id: project.id,
      scene_number: i + 1,
      narration_text: s.narration,
      image_prompt: s.image_prompt,
      duration_seconds: Math.round((template.duration * 60) / template.scenes_count),
      status: 'prompts_ready',
    }));
    await base44.entities.Scenes.bulkCreate(sceneData);

    // Generate topics for the project
    await base44.functions.invoke('generateTopics', {
      project_id: project.id,
      niche: template.niche,
    });

    navigate(createPageUrl(`StoryTopics?project_id=${project.id}`));
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-lg font-semibold text-gray-700">Or start from a template</h2>
        <p className="text-sm text-gray-500">Pre-configured with scenes, style, and pacing</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TEMPLATES.map(t => (
          <Card
            key={t.id}
            className="group hover:shadow-lg transition-all cursor-pointer border-2 hover:border-blue-300 overflow-hidden"
            onClick={() => !creating && handleSelect(t)}
          >
            <div className={`h-2 bg-gradient-to-r ${t.color}`} />
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{t.emoji}</span>
                  <div>
                    <h3 className="font-semibold text-sm">{t.name}</h3>
                    <p className="text-xs text-gray-500">{t.niche}</p>
                  </div>
                </div>
                {creating === t.id ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                ) : (
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                )}
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">{t.description}</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px] gap-1 py-0">
                  <Clock className="w-2.5 h-2.5" /> {t.duration} min
                </Badge>
                <Badge variant="outline" className="text-[10px] gap-1 py-0">
                  <Film className="w-2.5 h-2.5" /> {t.scenes_count} scenes
                </Badge>
                <Badge variant="outline" className="text-[10px] gap-1 py-0">
                  <Palette className="w-2.5 h-2.5" /> {t.visual_style.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="flex gap-1 flex-wrap">
                {t.tags.map(tag => (
                  <span key={tag} className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">#{tag}</span>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}