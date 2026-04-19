import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock, Unlock, Upload, Trash2, Save, Palette, User, Type, Sparkles } from 'lucide-react';

const FONT_OPTIONS = ['Impact', 'Bebas Neue', 'Montserrat Black', 'Anton', 'Oswald', 'Teko'];
const TEXT_PRESETS = ['mrbeast', 'hormozi', 'documentary', 'stacked_shadow', 'split_color', 'minimal'];
const MOOD_OPTIONS = ['crime', 'drama', 'nollywood', 'comedy', 'finance', 'inspirational', 'educational'];
const EMOTION_OPTIONS = ['auto', 'shock', 'curiosity', 'fear', 'greed', 'transformation', 'status', 'mystery', 'urgency', 'heartbreak'];
const COMPOSITIONS = ['auto', 'face_left_text_right', 'face_right_text_left', 'centered_face', 'split_screen', 'object_dominant'];
const VISUAL_STYLES = ['', 'cinematic_realistic', 'photorealistic_4k', 'cinematic_anime', 'anime', 'cartoon_2d', 'oil_painting', 'comic_book', '3d_whiteboard_cartoon'];

const TEMPLATE_IDS = [
  'shock_face', 'income_reveal', 'warning_alert', 'secret_hidden', 'breaking_news',
  'before_after', 'numbered_list', 'identity_challenge', 'finance_versus', 'lifestyle_proof',
  'finance_audit', 'cliffhanger', 'true_account', 'cold_case_file', 'suspect_reveal',
  'heartbreak_headline', 'relationship_red_flag', 'destination_wow', 'hidden_gem',
  'ai_takeover', 'cheat_code_reveal', 'tech_comparison', 'plot_twist_tease',
  'deep_lore_dive', 'reaction_recap',
];

function emptyDna(channel_id) {
  return {
    channel_id,
    face_reference_urls: '[]',
    face_descriptions: '[]',
    primary_color: '',
    secondary_color: '',
    background_color: '',
    text_color: '#FFFFFF',
    font_family: 'Impact',
    text_style_preset: 'mrbeast',
    mood_bias: 'drama',
    emotion_bias: 'auto',
    preferred_templates: '[]',
    banned_templates: '[]',
    composition_style: 'auto',
    visual_style_lock: '',
    logo_url: '',
    style_notes: '',
    is_active: true,
  };
}

function parseArr(s) {
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; }
  catch (_) { return []; }
}

export default function ChannelThumbnailDNAPanel({ channel_id, channel_name }) {
  const [dna, setDna] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const faces = parseArr(dna?.face_reference_urls);
  const faceDescs = parseArr(dna?.face_descriptions);
  const preferred = parseArr(dna?.preferred_templates);
  const banned = parseArr(dna?.banned_templates);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [channel_id]);

  async function load() {
    setLoading(true);
    try {
      const list = await base44.entities.ChannelThumbnailDNA.filter({ channel_id });
      setDna(list[0] || emptyDna(channel_id));
    } catch (e) {
      console.error('Load DNA failed:', e);
      setDna(emptyDna(channel_id));
    }
    setLoading(false);
  }

  function update(patch) { setDna(d => ({ ...d, ...patch })); }

  async function save() {
    setSaving(true);
    try {
      const payload = { ...dna, channel_id };
      if (dna.id) {
        await base44.entities.ChannelThumbnailDNA.update(dna.id, payload);
      } else {
        const created = await base44.entities.ChannelThumbnailDNA.create(payload);
        setDna(created);
      }
    } catch (e) {
      alert('Save failed: ' + e.message);
    }
    setSaving(false);
  }

  async function uploadFace(file, index) {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const updated = [...faces];
      if (typeof index === 'number') updated[index] = file_url;
      else updated.push(file_url);
      update({ face_reference_urls: JSON.stringify(updated) });
    } catch (e) {
      alert('Upload failed: ' + e.message);
    }
    setUploading(false);
  }

  function removeFace(index) {
    const u = faces.filter((_, i) => i !== index);
    const d = faceDescs.filter((_, i) => i !== index);
    update({ face_reference_urls: JSON.stringify(u), face_descriptions: JSON.stringify(d) });
  }

  function setFaceDesc(index, value) {
    const d = [...faceDescs];
    while (d.length <= index) d.push('');
    d[index] = value;
    update({ face_descriptions: JSON.stringify(d) });
  }

  function toggleTemplate(id, list, key) {
    const next = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
    update({ [key]: JSON.stringify(next) });
  }

  if (loading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200">
        <div className="flex items-center gap-2">
          {dna.is_active ? <Lock className="w-4 h-4 text-indigo-600" /> : <Unlock className="w-4 h-4 text-gray-400" />}
          <div>
            <div className="text-sm font-semibold text-gray-900">Thumbnail DNA {channel_name ? `— ${channel_name}` : ''}</div>
            <div className="text-[11px] text-gray-600">{dna.is_active ? 'Auto-injected into every thumbnail for this channel' : 'Disabled — generations use defaults'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">{dna.is_active ? 'On' : 'Off'}</span>
          <Switch checked={!!dna.is_active} onCheckedChange={v => update({ is_active: v })} />
        </div>
      </div>

      {/* Faces */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><User className="w-4 h-4" /> Locked Faces / Characters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-[11px] text-gray-500">Upload the face(s) that should appear on every thumbnail. Injected as references to the image model.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {faces.map((url, i) => (
              <div key={i} className="space-y-1">
                <div className="relative aspect-square rounded-md overflow-hidden border border-gray-200">
                  <img src={url} alt={`Face ${i + 1}`} className="w-full h-full object-cover" />
                  <button onClick={() => removeFace(i)} className="absolute top-1 right-1 p-1 bg-white/90 rounded hover:bg-red-50">
                    <Trash2 className="w-3 h-3 text-red-600" />
                  </button>
                </div>
                <Input
                  placeholder="Description (optional)"
                  value={faceDescs[i] || ''}
                  onChange={e => setFaceDesc(i, e.target.value)}
                  className="h-7 text-[11px]"
                />
              </div>
            ))}
            <label className="aspect-square rounded-md border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
              {uploading ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : <Upload className="w-5 h-5 text-gray-400" />}
              <span className="text-[10px] text-gray-500">Add Face</span>
              <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadFace(e.target.files[0])} />
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Colors + Font */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Palette className="w-4 h-4" /> Brand Palette & Font</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Primary', 'primary_color'],
            ['Secondary', 'secondary_color'],
            ['Background', 'background_color'],
            ['Text', 'text_color'],
          ].map(([label, key]) => (
            <div key={key}>
              <Label className="text-[11px] text-gray-600">{label}</Label>
              <div className="flex gap-1 mt-1">
                <input type="color" value={dna[key] || '#000000'} onChange={e => update({ [key]: e.target.value })} className="w-8 h-8 rounded border border-gray-200" />
                <Input value={dna[key] || ''} onChange={e => update({ [key]: e.target.value })} placeholder="#FFFFFF" className="h-8 text-xs flex-1" />
              </div>
            </div>
          ))}
          <div>
            <Label className="text-[11px] text-gray-600">Font</Label>
            <Select value={dna.font_family} onValueChange={v => update({ font_family: v })}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{FONT_OPTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] text-gray-600">Text Preset</Label>
            <Select value={dna.text_style_preset} onValueChange={v => update({ text_style_preset: v })}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{TEXT_PRESETS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] text-gray-600">Mood Bias</Label>
            <Select value={dna.mood_bias} onValueChange={v => update({ mood_bias: v })}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{MOOD_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] text-gray-600">Emotion Bias</Label>
            <Select value={dna.emotion_bias} onValueChange={v => update({ emotion_bias: v })}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{EMOTION_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Composition & Visual Style */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4" /> Composition & Style Lock</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] text-gray-600">Composition</Label>
            <Select value={dna.composition_style} onValueChange={v => update({ composition_style: v })}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{COMPOSITIONS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] text-gray-600">Visual Style Override</Label>
            <Select value={dna.visual_style_lock || '__none__'} onValueChange={v => update({ visual_style_lock: v === '__none__' ? '' : v })}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="No override" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No override (use project setting)</SelectItem>
                {VISUAL_STYLES.filter(Boolean).map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-[11px] text-gray-600">Logo URL (optional)</Label>
            <Input value={dna.logo_url || ''} onChange={e => update({ logo_url: e.target.value })} className="h-8 text-xs mt-1" placeholder="https://..." />
          </div>
          <div className="col-span-2">
            <Label className="text-[11px] text-gray-600">Channel Directives (freeform)</Label>
            <Textarea value={dna.style_notes || ''} onChange={e => update({ style_notes: e.target.value })} className="text-xs mt-1 min-h-[60px]" placeholder="e.g. Always show host from waist-up. Avoid cartoon-style illustrations. Use teal + orange grade." />
          </div>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Type className="w-4 h-4" /> Template Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-[11px] text-gray-600 mb-1 block">✅ Preferred (use first)</Label>
            <div className="flex flex-wrap gap-1">
              {TEMPLATE_IDS.map(id => (
                <button
                  key={id}
                  onClick={() => toggleTemplate(id, preferred, 'preferred_templates')}
                  disabled={banned.includes(id)}
                  className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                    preferred.includes(id)
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-400'
                  } ${banned.includes(id) ? 'opacity-30 cursor-not-allowed' : ''}`}
                >
                  {id.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-[11px] text-gray-600 mb-1 block">🚫 Banned (never use)</Label>
            <div className="flex flex-wrap gap-1">
              {TEMPLATE_IDS.map(id => (
                <button
                  key={id}
                  onClick={() => toggleTemplate(id, banned, 'banned_templates')}
                  disabled={preferred.includes(id)}
                  className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                    banned.includes(id)
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-red-400'
                  } ${preferred.includes(id) ? 'opacity-30 cursor-not-allowed' : ''}`}
                >
                  {id.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center justify-between gap-2 sticky bottom-0 bg-white border-t border-gray-200 pt-3">
        <div className="text-[11px] text-gray-500">
          {faces.length > 0 && <Badge variant="outline" className="mr-1">{faces.length} face{faces.length > 1 ? 's' : ''}</Badge>}
          {preferred.length > 0 && <Badge variant="outline" className="mr-1 text-emerald-700 border-emerald-200">{preferred.length} preferred</Badge>}
          {banned.length > 0 && <Badge variant="outline" className="text-red-700 border-red-200">{banned.length} banned</Badge>}
        </div>
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save DNA
        </Button>
      </div>
    </div>
  );
}