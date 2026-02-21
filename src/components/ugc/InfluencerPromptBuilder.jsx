import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const SKIN_TONES = [
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "olive", label: "Olive" },
  { value: "brown", label: "Brown" },
  { value: "dark", label: "Dark" },
];

const ETHNICITIES = [
  "Caucasian", "African", "African American", "East Asian", "South Asian",
  "Southeast Asian", "Middle Eastern", "Latino/Hispanic", "Mixed Race",
  "Indigenous", "Pacific Islander",
];

export function buildUGCPrompt({ gender, ageRange, skinTone, ethnicity, influencerType, action, clothing, hairStyle, setting, extraNotes }) {
  const isMale = gender === "male";
  const genderWord = isMale ? "male" : "female";
  const pronoun = isMale ? "he" : "she";

  // Skin tone specific details
  let skinDetails = "";
  if (skinTone === "dark") {
    skinDetails = `Rich melanin depth, natural highlight reflectivity on cheekbones and forehead, subtle tonal variation across cheeks and forehead, visible undertone shifts, realistic light absorption and reflection on dark skin, warm brown-to-deep-chocolate skin range.`;
  } else if (skinTone === "brown") {
    skinDetails = `Warm brown skin with natural undertone shifts, visible highlight reflectivity, subtle melanin variation across face, natural glow in well-lit areas.`;
  } else if (skinTone === "olive") {
    skinDetails = `Olive-toned skin with warm golden undertones, slight greenish cast in shadows, natural Mediterranean or South Asian complexion warmth, subtle sun-kissed areas.`;
  } else if (skinTone === "medium") {
    skinDetails = `Medium-toned skin with natural warmth, slight color variation between forehead and cheeks, visible pores and natural texture, subtle freckling or pigmentation.`;
  } else {
    skinDetails = `Light skin with visible capillaries near temples and under eyes, slight sun freckling, mild rosacea texture on cheeks, natural skin transparency in thin areas near eyelids, subtle blue veins visible.`;
  }

  // Gender specific details
  let genderDetails = "";
  if (isMale) {
    genderDetails = `Subtle facial stubble variation with natural beard growth density inconsistencies, visible skin grain, mild jawline asymmetry, natural masculine bone structure, Adam's apple visible.`;
  } else {
    genderDetails = `Natural feminine features, subtle lip volume variation, natural lash length without extensions, soft jawline contour, natural eyebrow density variation.`;
  }

  const clothingDesc = clothing || (isMale
    ? "Casual UGC aesthetic — plain crew neck t-shirt or hoodie, soft fabric texture, slight wrinkles and folds"
    : "Casual UGC aesthetic — neutral tone tank top or oversized hoodie, soft fabric texture, slight wrinkles and folds");

  const hairDesc = hairStyle || "naturally styled, individually rendered strands, baby hairs visible, natural flyaways, realistic scalp density, slight frizz, believable hairline irregularity";

  const settingDesc = setting || "Real apartment environment — slightly messy but aesthetic, soft clutter blur, plant in corner, natural wall imperfections, real-world lighting bounce";

  return `Create a hyper-realistic UGC influencer portrait as if captured on an iPhone 14 front camera in natural daylight. Shot on iPhone 14 front camera, no beauty filter, unedited raw image, social media compression artifacts.

Subject:
A real human ${genderWord} ${ethnicity || ""} ${influencerType || "lifestyle content creator"}, age ${ageRange || "24-30"}, natural facial proportions, slightly asymmetrical features, believable bone structure, subtle under-eye texture, natural smile lines, micro skin imperfections. ${pronoun} is ${action || "speaking naturally to camera"}.

Skin:
Ultra-detailed skin texture with visible pores, fine vellus facial hair, subtle oil sheen in T-zone, natural skin translucency, micro color variations, tiny freckles, realistic pigmentation shifts, mild redness around nose and cheeks, soft under-eye shadows, non-airbrushed skin, no plastic smoothness.
${skinDetails}

${genderDetails}

Lighting:
Soft window daylight from side, realistic falloff shadows, slightly uneven lighting like a real bedroom or apartment, subtle exposure clipping in highlights, dynamic range similar to smartphone HDR, no studio perfection.

Expression:
Authentic candid expression — slight smirk or mid-speech expression, relaxed jaw, natural eye micro-squint, believable muscle tension.

Camera:
Front-facing smartphone camera, 4K realism, shallow depth of field but not cinematic, minor lens distortion from wide-angle phone lens, slight digital noise, imperfect focus plane.

Hair:
${hairDesc}.

Clothing:
${clothingDesc}, no perfect symmetry.

Background:
${settingDesc}.

Micro-Details:
Subtle skin pores at 100% zoom, natural eyebrow density variation, slight lip dryness texture, tooth variation (not perfectly aligned veneers), realistic iris detail with asymmetry, tiny blemish or healed acne mark, mild neck skin creases.

Color Science:
True-to-life skin tones, no oversaturated AI look, natural white balance, slight warmth from indoor reflection.

${extraNotes ? `Additional Notes: ${extraNotes}` : ""}

Overall Style: Documentary realism, TikTok/Instagram Reel authenticity, NOT influencer studio glam, NOT beauty filter, NOT CGI smooth.

Negative Prompts: No plastic skin, no hyper-symmetry, no perfect teeth glow, no overly smooth forehead, no unrealistically sharp jawline, no fashion editorial lighting, no 3D render look, no doll-like skin, no exaggerated eyelashes, no artificial blur.`;
}

export default function InfluencerPromptBuilder({ config, onChange }) {
  const update = (key, val) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Gender</label>
          <Select value={config.gender || ""} onValueChange={v => update("gender", v)}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="male">Male</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Age Range</label>
          <Input value={config.ageRange || ""} onChange={e => update("ageRange", e.target.value)} placeholder="e.g. 24-30" className="h-9" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Skin Tone</label>
          <Select value={config.skinTone || ""} onValueChange={v => update("skinTone", v)}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {SKIN_TONES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Ethnicity</label>
          <Select value={config.ethnicity || ""} onValueChange={v => update("ethnicity", v)}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {ETHNICITIES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 mb-1 block">Hair Style</label>
        <Input value={config.hairStyle || ""} onChange={e => update("hairStyle", e.target.value)} placeholder="e.g. long wavy black hair, box braids, short fade..." className="h-9" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 mb-1 block">Clothing</label>
        <Input value={config.clothing || ""} onChange={e => update("clothing", e.target.value)} placeholder="e.g. white crop top, oversized grey hoodie..." className="h-9" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 mb-1 block">Setting / Background</label>
        <Input value={config.setting || ""} onChange={e => update("setting", e.target.value)} placeholder="e.g. modern kitchen, bedroom with fairy lights..." className="h-9" />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 mb-1 block">Extra Notes</label>
        <Textarea value={config.extraNotes || ""} onChange={e => update("extraNotes", e.target.value)} placeholder="Any additional appearance details..." className="min-h-[60px]" />
      </div>
    </div>
  );
}