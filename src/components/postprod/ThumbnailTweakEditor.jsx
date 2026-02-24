import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Type, Palette, User, Box, Sparkles, Plus, X, ChevronDown, ChevronUp
} from 'lucide-react';

export default function ThumbnailTweakEditor({ analysis, thumbnailUrl, onBuildPrompt }) {
  // Extract editable fields from analysis
  const layers = analysis?.layers || {};
  const fg = layers.foreground || {};
  const bg = layers.background || {};
  const textGraphics = layers.text_and_graphics || {};
  const styling = analysis?.styling || {};

  // Tweak state — initialized from analysis
  const [textTweaks, setTextTweaks] = useState(() => {
    const elements = textGraphics.elements || [];
    return elements.map(el => ({
      original: el.text || '',
      newText: el.text || '',
      color: el.color || '',
      position: el.position || '',
      font: el.font || '',
      outline: el.outline || '',
    }));
  });

  const [colorTweaks, setColorTweaks] = useState({
    background: bg.colors || bg.mood || '',
    accentColor: analysis?.editable_elements?.accent_color || '',
    atmosphere: bg.atmosphere || '',
    colorGrading: styling.color_grading || '',
  });

  const [subjectTweaks, setSubjectTweaks] = useState(() => {
    const subjects = fg.subjects || layers.midground?.subjects || [];
    return subjects.map(s => ({
      original: s.description || s.archetype || '',
      archetype: s.archetype || '',
      expression: s.expression_decoded || s.expression || '',
      clothing: s.clothing || '',
      hair: s.hair || '',
      pose: s.pose || s.crop || '',
      customNotes: '',
    }));
  });

  const [objectTweaks, setObjectTweaks] = useState({
    backgroundSetting: bg.setting || bg.description || '',
    additionalObjects: '',
    removeObjects: '',
  });

  const [globalNotes, setGlobalNotes] = useState('');

  const [expandedSections, setExpandedSections] = useState({
    text: true, colors: false, subjects: false, objects: false, notes: false
  });

  const toggleSection = (key) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const handleBuildPrompt = () => {
    // Build structured tweaks object
    const tweaks = {
      textChanges: textTweaks.map(t => ({
        original: t.original,
        newText: t.newText,
        color: t.color,
        position: t.position,
        font: t.font,
        outline: t.outline,
      })),
      colorChanges: colorTweaks,
      subjectChanges: subjectTweaks.map(s => ({
        archetype: s.archetype,
        expression: s.expression,
        clothing: s.clothing,
        hair: s.hair,
        pose: s.pose,
        customNotes: s.customNotes,
      })),
      objectChanges: objectTweaks,
      globalNotes,
    };
    onBuildPrompt(tweaks);
  };

  const SectionHeader = ({ icon: Icon, label, sectionKey, badgeCount }) => (
    <button
      className="flex items-center gap-2 w-full text-left py-2 px-1 hover:bg-gray-50 rounded transition-colors"
      onClick={() => toggleSection(sectionKey)}
    >
      <Icon className="w-4 h-4 text-blue-600" />
      <span className="text-sm font-semibold flex-1">{label}</span>
      {badgeCount > 0 && <Badge variant="secondary" className="text-[10px]">{badgeCount}</Badge>}
      {expandedSections[sectionKey] ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
    </button>
  );

  return (
    <div className="space-y-3">
      {/* Reference preview */}
      <div className="flex gap-3">
        <img src={thumbnailUrl} alt="Reference" className="w-28 h-auto rounded-lg shadow-sm flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-600 mb-1">Tweak any element below, then generate.</p>
          <p className="text-[11px] text-gray-400">AI will recreate this thumbnail with your changes using Ideogram V3.</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            <Badge variant="outline" className="text-[10px]">{analysis?.style_category}</Badge>
            {analysis?.color_palette?.slice(0, 3).map((c, i) => (
              <div key={i} className="w-4 h-4 rounded border" style={{ backgroundColor: c }} title={c} />
            ))}
          </div>
        </div>
      </div>

      {/* TEXT TWEAKS */}
      <SectionHeader icon={Type} label="Text Overlays" sectionKey="text" badgeCount={textTweaks.length} />
      {expandedSections.text && (
        <div className="space-y-3 pl-1">
          {textTweaks.length === 0 && (
            <p className="text-xs text-gray-400 italic">No text detected. Add one below.</p>
          )}
          {textTweaks.map((t, i) => (
            <Card key={i} className="border-blue-100">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">Text {i + 1}</Badge>
                  {t.original && <span className="text-[10px] text-gray-400">was: "{t.original}"</span>}
                  <button className="ml-auto text-gray-300 hover:text-red-500" onClick={() => setTextTweaks(prev => prev.filter((_, j) => j !== i))}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <Input
                  value={t.newText}
                  onChange={e => {
                    const updated = [...textTweaks];
                    updated[i] = { ...updated[i], newText: e.target.value };
                    setTextTweaks(updated);
                  }}
                  placeholder="New text (e.g. THEY LIED)"
                  className="text-sm font-bold"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={t.color}
                    onChange={e => {
                      const updated = [...textTweaks];
                      updated[i] = { ...updated[i], color: e.target.value };
                      setTextTweaks(updated);
                    }}
                    placeholder="Color (e.g. vivid red)"
                    className="text-xs"
                  />
                  <Input
                    value={t.position}
                    onChange={e => {
                      const updated = [...textTweaks];
                      updated[i] = { ...updated[i], position: e.target.value };
                      setTextTweaks(updated);
                    }}
                    placeholder="Position (e.g. bottom center)"
                    className="text-xs"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1 text-xs border-dashed"
            onClick={() => setTextTweaks(prev => [...prev, { original: '', newText: '', color: 'white', position: 'bottom center', font: 'Impact bold', outline: 'thick black outline' }])}
          >
            <Plus className="w-3 h-3" /> Add Text
          </Button>
        </div>
      )}

      {/* COLOR TWEAKS */}
      <SectionHeader icon={Palette} label="Colors & Mood" sectionKey="colors" />
      {expandedSections.colors && (
        <div className="space-y-2 pl-1">
          <div>
            <label className="text-xs text-gray-500">Background Colors/Mood</label>
            <Input value={colorTweaks.background} onChange={e => setColorTweaks(prev => ({ ...prev, background: e.target.value }))} placeholder="e.g. deep teal with warm amber accents" className="text-xs" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Accent Color</label>
            <Input value={colorTweaks.accentColor} onChange={e => setColorTweaks(prev => ({ ...prev, accentColor: e.target.value }))} placeholder="e.g. neon yellow" className="text-xs" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Atmosphere (fog, particles, bokeh...)</label>
            <Input value={colorTweaks.atmosphere} onChange={e => setColorTweaks(prev => ({ ...prev, atmosphere: e.target.value }))} placeholder="e.g. heavy smoke with ember particles" className="text-xs" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Color Grading</label>
            <Input value={colorTweaks.colorGrading} onChange={e => setColorTweaks(prev => ({ ...prev, colorGrading: e.target.value }))} placeholder="e.g. cinematic teal-and-orange" className="text-xs" />
          </div>
        </div>
      )}

      {/* SUBJECT / HUMAN TWEAKS */}
      <SectionHeader icon={User} label="People / Subjects" sectionKey="subjects" badgeCount={subjectTweaks.length} />
      {expandedSections.subjects && (
        <div className="space-y-3 pl-1">
          {subjectTweaks.length === 0 && (
            <p className="text-xs text-gray-400 italic">No subjects detected. Add one below.</p>
          )}
          {subjectTweaks.map((s, i) => (
            <Card key={i} className="border-purple-100">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] bg-purple-50">Person {i + 1}</Badge>
                  <button className="ml-auto text-gray-300 hover:text-red-500" onClick={() => setSubjectTweaks(prev => prev.filter((_, j) => j !== i))}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <Input
                  value={s.archetype}
                  onChange={e => {
                    const updated = [...subjectTweaks];
                    updated[i] = { ...updated[i], archetype: e.target.value };
                    setSubjectTweaks(updated);
                  }}
                  placeholder="Archetype (e.g. 30s athletic man, olive skin, sharp jaw)"
                  className="text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={s.expression}
                    onChange={e => {
                      const updated = [...subjectTweaks];
                      updated[i] = { ...updated[i], expression: e.target.value };
                      setSubjectTweaks(updated);
                    }}
                    placeholder="Expression (e.g. shocked, intense stare)"
                    className="text-xs"
                  />
                  <Input
                    value={s.clothing}
                    onChange={e => {
                      const updated = [...subjectTweaks];
                      updated[i] = { ...updated[i], clothing: e.target.value };
                      setSubjectTweaks(updated);
                    }}
                    placeholder="Clothing (e.g. black hoodie)"
                    className="text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={s.hair}
                    onChange={e => {
                      const updated = [...subjectTweaks];
                      updated[i] = { ...updated[i], hair: e.target.value };
                      setSubjectTweaks(updated);
                    }}
                    placeholder="Hair (e.g. short dark fade)"
                    className="text-xs"
                  />
                  <Input
                    value={s.pose}
                    onChange={e => {
                      const updated = [...subjectTweaks];
                      updated[i] = { ...updated[i], pose: e.target.value };
                      setSubjectTweaks(updated);
                    }}
                    placeholder="Pose (e.g. chest-up, facing camera)"
                    className="text-xs"
                  />
                </div>
                <Input
                  value={s.customNotes}
                  onChange={e => {
                    const updated = [...subjectTweaks];
                    updated[i] = { ...updated[i], customNotes: e.target.value };
                    setSubjectTweaks(updated);
                  }}
                  placeholder="Other changes (e.g. add gold chain, remove glasses)"
                  className="text-xs"
                />
              </CardContent>
            </Card>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1 text-xs border-dashed"
            onClick={() => setSubjectTweaks(prev => [...prev, { original: '', archetype: '', expression: '', clothing: '', hair: '', pose: '', customNotes: '' }])}
          >
            <Plus className="w-3 h-3" /> Add Person
          </Button>
        </div>
      )}

      {/* OBJECTS / BACKGROUND */}
      <SectionHeader icon={Box} label="Objects & Background" sectionKey="objects" />
      {expandedSections.objects && (
        <div className="space-y-2 pl-1">
          <div>
            <label className="text-xs text-gray-500">Background Setting</label>
            <Input value={objectTweaks.backgroundSetting} onChange={e => setObjectTweaks(prev => ({ ...prev, backgroundSetting: e.target.value }))} placeholder="e.g. dark office with blue monitor glow" className="text-xs" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Add Objects</label>
            <Input value={objectTweaks.additionalObjects} onChange={e => setObjectTweaks(prev => ({ ...prev, additionalObjects: e.target.value }))} placeholder="e.g. stack of cash, broken phone, fire" className="text-xs" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Remove Objects</label>
            <Input value={objectTweaks.removeObjects} onChange={e => setObjectTweaks(prev => ({ ...prev, removeObjects: e.target.value }))} placeholder="e.g. logo, watermark, second person" className="text-xs" />
          </div>
        </div>
      )}

      {/* GLOBAL NOTES */}
      <SectionHeader icon={Sparkles} label="Additional Instructions" sectionKey="notes" />
      {expandedSections.notes && (
        <div className="pl-1">
          <Textarea
            value={globalNotes}
            onChange={e => setGlobalNotes(e.target.value)}
            placeholder="Any other changes: make it more dramatic, change to horror style, add split screen effect..."
            className="text-xs min-h-[60px]"
          />
        </div>
      )}

      <Button onClick={handleBuildPrompt} className="w-full bg-blue-600 hover:bg-blue-700 gap-2">
        <Sparkles className="w-4 h-4" />
        Build Prompt & Generate
      </Button>
    </div>
  );
}