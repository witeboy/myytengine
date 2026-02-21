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

export function buildUGCPrompt({ gender, ageRange, skinTone, ethnicity, influencerType, action, clothing, hairStyle, setting, extraNotes, holdMode, productDescription }) {
  const isMale = gender === "male";
  const genderWord = isMale ? "male" : "female";
  const pronoun = isMale ? "he" : "she";
  const possessive = isMale ? "his" : "her";

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

  const settingDesc = setting || "Real home workspace — slightly messy desk, laptop open in background, headphones casually placed, keyboard slightly out of focus, posters on wall but not perfectly aligned, natural lived-in vibe";

  // Product / phone section based on holdMode
  let productSection = "";
  const prodDesc = productDescription || "a product";

  if (holdMode === "phone_app") {
    productSection = `
Product (Phone with App):
Creator holding a smartphone toward the camera with ${possessive} hand, screen clearly visible and facing the viewer showing ${prodDesc}. Phone held at a natural selfie-review angle, slightly tilted. Grip is casual and imperfect — thumb on edge, fingers wrapped naturally around the back of the phone. Tiny natural hand creases visible, slight finger pressure indentations. The phone screen is bright, clearly readable, and shows the app UI naturally integrated. Phone reflection catches ambient light realistically. NOT a stock photo pose — feels like ${pronoun} is showing a friend something cool on ${possessive} phone.`;
  } else if (holdMode === "product_unbox") {
    productSection = `
Product (Unboxing):
Creator mid-unbox, ${prodDesc} partially pulled out of packaging. Box or packaging visible, slightly torn or opened edges. ${pronoun} holds the product with genuine excitement, grip slightly imperfect. Product angled naturally, catching side light. Tiny natural hand creases visible. Packaging material (tissue paper, foam, plastic wrap) partially visible. Feels like a genuine unboxing moment, NOT staged for a commercial.`;
  } else if (holdMode === "product_table") {
    productSection = `
Product (On Table):
${prodDesc} placed on the desk/table in front of the creator. Creator is pointing at it or gesturing toward it with one hand. Product positioned naturally, slightly off-center. Natural desk surface texture visible. Product catches ambient light realistically. Creator's hand gesture is casual — open palm pointing or index finger indicating. NOT a product photo setup — casual desk placement with other items around it.`;
  } else if (holdMode !== "none") {
    // Default: product_review — holding product
    productSection = `
Product:
Creator holding ${prodDesc} naturally in one hand (not posed like an ad). Grip slightly imperfect — fingers wrapped casually, not perfectly positioned for branding. Product slightly angled, catching natural side light. Tiny natural hand creases visible, slight finger pressure on product surface. Product texture and details visible but not over-lit. ${pronoun} holds it at chest-to-chin height as if showing it to the camera during a casual review. Feels like a spontaneous product recommendation, NOT a commercial. NOT staged. Authentic. Trustworthy.`;
  }

  return `Create a hyper-realistic UGC-style image of a real human creator casually recording a ${holdMode === "phone_app" ? "app review" : "product review"} at home. PORTRAIT FORMAT 9:16 aspect ratio (vertical, like a TikTok/Reel).

Subject:
A real human ${genderWord} ${ethnicity || ""} ${influencerType || "lifestyle content creator"}, age ${ageRange || "mid-20s to early-30s"}, natural facial asymmetry, subtle under-eye texture, visible skin pores, natural lip lines, faint blemishes and micro skin imperfections (no airbrushing). Teeth slightly imperfect, not overly white. Eyes moist with natural light reflection. ${pronoun} is ${action || "casually recording a product review, speaking naturally to the camera"}.

Skin:
Ultra-detailed skin texture with visible pores, fine vellus facial hair, subtle oil sheen in T-zone, natural skin translucency, micro color variations, tiny freckles, realistic pigmentation shifts, mild redness around nose and cheeks, soft under-eye shadows, non-airbrushed skin, no plastic smoothness.
${skinDetails}

${genderDetails}

Expression:
Genuine mid-sentence expression, slightly raised eyebrows, natural smile that isn't posed. Authentic, relaxed, conversational energy. Slight head tilt as if speaking to the camera.

Camera & Framing:
Shot on iPhone front camera, VERTICAL 9:16 portrait format, handheld feel.
Slight motion blur in hands.
Subtle lens distortion from front camera.
Framing slightly imperfect (not perfectly centered).
Eye-level angle.
Shallow depth of field but not cinematic — realistic smartphone depth.

Lighting:
Natural window light from the side. Soft shadows. Minor overexposed highlights. Skin shine visible (realistic). No studio lighting. Slightly uneven lighting like a real bedroom or apartment.

Hair:
${hairDesc}.

Clothing:
${clothingDesc}. Natural clothing folds. Fabric texture visible. No perfect symmetry.
${productSection}

Environment:
${settingDesc}.

Texture & Realism:
Ultra-detailed skin pores. Fine facial hair. Flyaway hairs. Micro-wrinkles around eyes. Natural clothing folds. Fabric texture visible. No plastic skin. No over-sharpening. No HDR effect.

Color & Tone:
Neutral color grading. Slight warmth. Not overly saturated. Feels native to TikTok/Reels. No heavy cinematic look. True-to-life skin tones, no oversaturated AI look, natural white balance.

Energy:
Feels like a spontaneous ${holdMode === "phone_app" ? "app recommendation" : "product recommendation"}. Not a commercial. Not staged. Authentic. Trustworthy. Relatable. Monetizable niche creator vibe.

Quality:
High resolution but not artificially enhanced. Natural grain. No AI smoothness. No CGI look. PORTRAIT 9:16 vertical format.

${extraNotes ? `Additional Notes: ${extraNotes}` : ""}

Negative Prompts: No plastic skin, no hyper-symmetry, no perfect teeth glow, no overly smooth forehead, no unrealistically sharp jawline, no fashion editorial lighting, no 3D render look, no doll-like skin, no exaggerated eyelashes, no artificial blur, no landscape/horizontal format.`;
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