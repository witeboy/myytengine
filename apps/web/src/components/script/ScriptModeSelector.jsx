import React from 'react';
import { Flame, Moon, BookOpen, Film, Clapperboard, Cpu } from 'lucide-react';

// ── Main modes ─────────────────────────────────────────────────────────
const MODES = [
  {
    id: '',
    label: 'Standard (Viral)',
    desc: 'Netflix-style documentary. Hook, Escalation, Reveal, Resolution.',
    icon: Flame,
    color: 'orange',
  },
  {
    id: 'explainer',
    label: 'Explainer Video',
    desc: 'Teach a concept clearly and memorably. Pick a subject below.',
    icon: Cpu,
    color: 'sky',
    hasSub: true,
  },
  {
    id: 'story',
    label: 'Story / Fiction',
    desc: 'Original scripted stories. Pick a genre below.',
    icon: BookOpen,
    color: 'violet',
    hasSub: true,
  },
  {
    id: 'youtube_shorts',
    label: 'YouTube Shorts',
    desc: '90s high-retention. Hook, Tension, 3 Rules, CTA.',
    icon: Film,
    color: 'green',
    hasSub: true,
  },
  {
    id: 'long_viral',
    label: 'Long Viral',
    desc: 'Viral Shorts structure scaled to 5 to 60 min.',
    icon: Clapperboard,
    color: 'amber',
    hasSub: true,
  },
  {
    id: 'sleep_story',
    label: 'Sleep Story',
    desc: 'A classic folk/fairy-tale retold slowly with characters and a gentle plot. Not affirmations.',
    icon: Moon,
    color: 'purple',
  },
];

// ── Explainer sub-types ────────────────────────────────────────────────
const EXPLAINER_ARCHES = [
  {
    id: 'explainer_tech',
    label: 'Tech & IT',
    emoji: '💻',
    desc: 'Software, hardware, cybersecurity, engineering concepts.',
    structure: 'WTF Hook, Context, 3-Step Breakdown, Real-World Impact, CTA',
  },
  {
    id: 'explainer_finance',
    label: 'Personal Finance',
    emoji: '💰',
    desc: 'Budgeting, crypto, stock market. High-CPM advertising niche.',
    structure: 'Stakes Hook, Myth Kill, Mechanism, Step-by-Step, CTA',
  },
  {
    id: 'explainer_legal',
    label: 'Legal & Tax',
    emoji: '⚖️',
    desc: 'Complex laws, tax concepts, rights explained in plain language.',
    structure: 'Real Case Hook, Plain-English Translation, Traps, What To Do, CTA',
  },
  {
    id: 'explainer_ai',
    label: 'AI Tools & Tutorials',
    emoji: '🤖',
    desc: 'Review and teach the latest AI tools. Exploding 340% in growth.',
    structure: 'Demo Hook, Before/After, Setup Guide, Pro Tips, CTA',
  },
];

// ── Story arch sub-types ───────────────────────────────────────────────
const STORY_ARCHES = [
  {
    id: 'story_comedy',
    label: 'Comedy',
    emoji: '😂',
    desc: 'Situational humor, absurd scenarios, funny characters.',
    structure: 'Setup, Escalating Misunderstanding, Callback, Punchline Resolution',
  },
  {
    id: 'story_children',
    label: "Children's Story",
    emoji: '🌟',
    desc: 'Simple words, wonder, moral lessons, relatable heroes.',
    structure: 'Meet Hero, Problem, 3 Attempts, Lesson, Happy End',
  },
  {
    id: 'story_nursery',
    label: 'Nursery Rhyme',
    emoji: '🎵',
    desc: 'Rhyming verse, rhythm, playful imagery for very young audiences.',
    structure: 'AABB or ABAB Rhyme Scheme, Repetition, Sing-Song Rhythm',
  },
  {
    id: 'story_crime',
    label: 'Crime / True Crime',
    emoji: '🔍',
    desc: 'Mystery, investigation, tension, reveals.',
    structure: 'Cold Open Crime, Investigation, Red Herrings, Revelation, Justice',
  },
  {
    id: 'story_love',
    label: 'Love / Romance',
    emoji: '❤️',
    desc: 'Emotional depth, longing, obstacles, resolution.',
    structure: 'Meet, Tension, Obstacle, Vulnerability, Resolution',
  },
  {
    id: 'story_horror',
    label: 'Horror',
    emoji: '👻',
    desc: 'Dread, atmosphere, the unknown, psychological fear.',
    structure: 'Normal World, First Signs, Escalating Dread, Confrontation, Aftermath',
  },
  {
    id: 'story_thriller',
    label: 'Thriller',
    emoji: '⚡',
    desc: 'Stakes, reversals, ticking clock, relentless momentum.',
    structure: 'Crisis, Race Against Time, Betrayal, Twist, Climax',
  },
  {
    id: 'story_historical',
    label: 'Historical Fiction',
    emoji: '🏛️',
    desc: 'Real periods, authentic detail, human drama across time.',
    structure: 'Time and Place Anchor, Character Stakes, Historical Pressure, Consequence',
  },
  {
    id: 'story_scifi',
    label: 'Sci-Fi',
    emoji: '🚀',
    desc: 'Future worlds, technology, moral dilemmas, the unknown.',
    structure: 'World Rules, Character Desire, System Conflict, Idea Revelation',
  },
  {
    id: 'story_mystery',
    label: 'Mystery',
    emoji: '🕵️',
    desc: 'Puzzles, clues, deduction, satisfying reveals.',
    structure: 'Inciting Puzzle, Clue Drops, False Solutions, Revelation, Resolution',
  },
  {
    id: 'story_adventure',
    label: 'Adventure',
    emoji: '🗺️',
    desc: 'Journey, obstacles, growth, triumph.',
    structure: 'Call to Adventure, Threshold, Tests, Ordeal, Return Transformed',
  },
];

// ── Shorts and Long Viral niches ───────────────────────────────────────
const SHORTS_NICHES = [
  { id: 'finance',        label: '💰 Finance / Wealth',  desc: 'Hook, Tension, Pivot, 3 Rules, CTA' },
  { id: 'book',           label: '📚 Book Summaries',    desc: 'Hook, Context, 3 Lessons, Transformation, CTA' },
  { id: 'crime_story',    label: '🔪 Crime Story',       desc: 'Cold Open, Setup, Escalation, Twist, CTA' },
  { id: 'tech_explainer', label: '⚡ Tech Explainer',    desc: 'WTF Hook, Context, 3 Steps, So What, CTA' },
  { id: 'side_hustle',    label: '💸 Side Hustle',       desc: 'Proof Hook, Myth Kill, 3 Steps, Proof, CTA' },
];

// ── Color config ───────────────────────────────────────────────────────
const C = {
  orange: { active: 'border-orange-500 bg-orange-50', icon: 'text-orange-600', badge: 'bg-orange-100 text-orange-700', divider: 'border-orange-200', label: 'text-orange-800' },
  sky:    { active: 'border-sky-500 bg-sky-50',       icon: 'text-sky-600',    badge: 'bg-sky-100 text-sky-700',       divider: 'border-sky-200',    label: 'text-sky-800' },
  violet: { active: 'border-violet-500 bg-violet-50', icon: 'text-violet-600', badge: 'bg-violet-100 text-violet-700', divider: 'border-violet-200', label: 'text-violet-800' },
  green:  { active: 'border-green-500 bg-green-50',   icon: 'text-green-600',  badge: 'bg-green-100 text-green-700',   divider: 'border-green-200',  label: 'text-green-800' },
  amber:  { active: 'border-amber-500 bg-amber-50',   icon: 'text-amber-600',  badge: 'bg-amber-100 text-amber-700',   divider: 'border-amber-200',  label: 'text-amber-800' },
  indigo: { active: 'border-indigo-500 bg-indigo-50', icon: 'text-indigo-600', badge: 'bg-indigo-100 text-indigo-700', divider: 'border-indigo-200', label: 'text-indigo-800' },
  purple: { active: 'border-purple-500 bg-purple-50', icon: 'text-purple-600', badge: 'bg-purple-100 text-purple-700', divider: 'border-purple-200', label: 'text-purple-800' },
};

function SubPicker({ items, selected, onSelect, colorKey, title, hint }) {
  const c = C[colorKey] || C.orange;
  return (
    <div className={'mt-4 pt-4 border-t ' + c.divider}>
      <p className={'text-sm font-semibold mb-0.5 ' + c.label}>{title}</p>
      {hint && <p className="text-xs text-gray-500 mb-3">{hint}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {items.map(function(item) {
          var active = selected === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={function() { onSelect(item.id); }}
              className={
                'text-left p-3 rounded-lg border-2 transition-all ' +
                (active ? c.active : 'border-gray-200 hover:border-gray-300 bg-white')
              }
            >
              <p className="text-sm font-semibold text-gray-900 mb-0.5">
                {item.emoji ? item.emoji + ' ' : ''}{item.label}
              </p>
              <p className="text-xs text-gray-500 leading-snug mb-1">{item.desc}</p>
              {item.structure && (
                <p className={'text-xs leading-tight ' + (active ? c.icon : 'text-gray-400')}>
                  {item.structure}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ScriptModeSelector({ value, onChange, shortsNiche, onShortsNicheChange }) {
  var mode = value || '';

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium block">Script Mode</label>
      <p className="text-xs text-gray-500 mb-3">Controls how scripts are structured and written</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {MODES.map(function(m) {
          var selected = mode === m.id;
          var c = C[m.color] || C.orange;
          var Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              onClick={function() { onChange(m.id); }}
              className={
                'flex flex-col items-start gap-1.5 p-3 rounded-lg border-2 text-left transition-all ' +
                (selected ? c.active : 'border-gray-200 hover:border-gray-300 bg-white')
              }
            >
              <div className="flex items-center gap-2 w-full">
                <Icon className={'w-4 h-4 ' + (selected ? c.icon : 'text-gray-400')} />
                <span className={'text-sm font-semibold ' + (selected ? 'text-gray-900' : 'text-gray-600')}>
                  {m.label}
                </span>
                {selected && (
                  <span className={'text-xs px-1.5 py-0.5 rounded-full ml-auto font-medium ' + c.badge}>
                    Active
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-500 leading-tight">{m.desc}</span>
            </button>
          );
        })}
      </div>

      {mode === 'explainer' && onShortsNicheChange && (
        <SubPicker
          items={EXPLAINER_ARCHES}
          selected={shortsNiche || 'explainer_tech'}
          onSelect={onShortsNicheChange}
          colorKey="sky"
          title="Explainer Subject"
          hint="Each subject has a unique teaching structure and tone optimized for that audience"
        />
      )}

      {mode === 'story' && onShortsNicheChange && (
        <SubPicker
          items={STORY_ARCHES}
          selected={shortsNiche || 'story_crime'}
          onSelect={onShortsNicheChange}
          colorKey="violet"
          title="Story Genre"
          hint="Each genre shapes the narrative structure, voice, pacing and emotional tone of the entire script"
        />
      )}

      {mode === 'youtube_shorts' && onShortsNicheChange && (
        <SubPicker
          items={SHORTS_NICHES}
          selected={shortsNiche || 'finance'}
          onSelect={onShortsNicheChange}
          colorKey="green"
          title="Shorts Structure"
          hint="Each niche has a unique storytelling structure optimized for retention"
        />
      )}

      {mode === 'long_viral' && onShortsNicheChange && (
        <SubPicker
          items={SHORTS_NICHES}
          selected={shortsNiche || 'finance'}
          onSelect={onShortsNicheChange}
          colorKey="amber"
          title="Long Viral Structure"
          hint="Same viral structures as Shorts, scaled to your chosen duration (5 to 60 min)"
        />
      )}

      {mode === 'sleep_story' && (
        <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-purple-800 mb-1">What you will get</p>
          <p className="text-xs text-purple-700 leading-relaxed">
            A classic folk or fairy tale, retold slowly in a soothing storyteller's voice — named
            characters, a real setting, and a gentle plot that unfolds and resolves peacefully.
            Interesting enough to follow, calm enough to drift off to. Not affirmations. Not guided
            breathing. An actual story.
          </p>
        </div>
      )}
    </div>
  );
}