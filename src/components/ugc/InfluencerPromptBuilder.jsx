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

  // Product / phone section based on holdMode — CRITICAL for believable interaction
  let productSection = "";
  let interactionDirective = "";
  const prodDesc = productDescription || "a product";

  if (holdMode === "phone_app") {
    productSection = `
PRODUCT INTERACTION — Phone with App (CRITICAL ELEMENT):
Creator is ACTIVELY interacting with ${prodDesc} on ${possessive} phone. ${pronoun} is mid-gesture: one hand holding the phone at a natural selfie-review angle tilted toward camera, the OTHER hand's index finger is visibly touching or about to tap the phone screen — frozen mid-interaction. The phone screen is BRIGHT, clearly readable, facing the viewer, showing the app UI of ${prodDesc}. Screen glow illuminates ${possessive} chin and fingers with a subtle cool-white light bounce.
${pronoun} is looking at the phone screen with genuine fascination — eyes locked on it, eyebrows slightly raised in a "look at this!" expression, mouth slightly open mid-sentence as if explaining a feature to a friend over FaceTime. Body is naturally leaned slightly forward toward the phone, creating authentic engagement body language.
Grip details: thumb on the left edge of the phone, fingers curled naturally around the back — NOT a posed commercial grip. Knuckle creases visible, slight nail imperfections, natural finger pressure dents on phone edge. Phone case shows micro-wear and tiny scratches (lived-in feel). Screen reflection catches a faint window light glare on one corner.
The ENTIRE composition communicates: "I use this app every day and I genuinely want you to try it." This is the hero interaction of the image — phone and hand interaction must be the focal point at chest height, clearly visible, with the face providing emotional context above.`;
    interactionDirective = `INTERACTION ENERGY: ${pronoun} is mid-demo of the app — body language says "let me show you this one feature" with leaned-in enthusiasm. The phone screen and ${possessive} interaction with it is the ANCHOR of the image. Eyes and finger both point toward the screen creating a natural visual triangle (face → finger → screen).`;
  } else if (holdMode === "product_unbox") {
    productSection = `
PRODUCT INTERACTION — Unboxing (CRITICAL ELEMENT):
Creator is ACTIVELY mid-unbox of ${prodDesc} — this is a frozen moment of genuine discovery. Both hands are engaged: one hand pulling the product UP and OUT of the box, the other hand steadying the packaging. The product is 60% revealed, partially wrapped in tissue paper or protective film that ${pronoun} is peeling away.
Face shows GENUINE surprise and delight — eyes wide, mouth in an excited "oh!" shape, eyebrows lifted high. ${pronoun} is looking DOWN at the product (not at camera) in this authentic moment of discovery. Body language: shoulders slightly hunched forward in eager anticipation, chest leaned over the box.
Box/packaging details: branded box on ${possessive} lap or on desk, lid flipped open at an angle, tissue paper crumpled and partially pulled out, maybe a small card or instruction leaflet visible poking out. Box shows real shipping wear — slight corner dent, tape residue. This is NOT a clean product shot — it's a real unboxing moment with packaging debris.
Hands show real interaction: fingers gripping the product with slight tension, knuckles engaged, one fingernail maybe snagging the protective film. Natural hand creases deepened from grip pressure. The product catches side light as it emerges, creating a subtle reveal drama.
The ENTIRE composition communicates: "I literally JUST opened this and I'm already obsessed." Raw, unfiltered first-impression energy.`;
    interactionDirective = `INTERACTION ENERGY: Frozen at the peak moment of unboxing — the product is half-revealed and ${possessive} face shows that split-second of genuine excitement. Both hands are busy, packaging is messy, energy is chaotic-authentic. This frame should feel like a screenshot from a real unboxing video.`;
  } else if (holdMode === "product_table") {
    productSection = `
PRODUCT INTERACTION — Product on Table (CRITICAL ELEMENT):
${prodDesc} is placed on the desk/table surface in front of the creator, slightly off-center. Creator is ACTIVELY gesturing toward it — not just pointing, but mid-explanatory gesture: one hand with fingers spread open, palm facing up beside the product in a "look at this" presentation gesture, as if ${pronoun} just placed it down and is inviting the viewer to examine it.
${possessive} other hand is animated too — maybe touching ${possessive} chin thoughtfully, or fingers counting off features, or palm pressed flat on the desk leaning forward. Body is angled toward the product, torso twisted slightly, creating dynamic "I'm telling you about this thing" body language.
Face is looking at CAMERA (not the product) with a knowing, confident expression — slight smirk, one eyebrow slightly raised, as if saying "trust me on this one." Eyes make direct contact with the viewer.
Product details: ${prodDesc} sits naturally on a real surface with other desk items around it (coffee cup, pen, phone, random papers) — NOT isolated on a clean surface. Natural shadows fall from the product. Desk surface texture visible — wood grain, scratches, ring stains from cups.
The ENTIRE composition creates a visual flow: viewer's eye goes from ${possessive} face → ${possessive} presenting hand → the product, creating a clear storytelling path.`;
    interactionDirective = `INTERACTION ENERGY: ${pronoun} is mid-pitch, presenting the product with enthusiastic hand gestures and confident eye contact. Body language is open, inviting, and persuasive. The product on the table is the subject of ${possessive} passionate explanation — every gesture leads the viewer's eye to it.`;
  } else if (holdMode !== "none") {
    // Default: product_review — holding product
    productSection = `
PRODUCT INTERACTION — Holding Product Review (CRITICAL ELEMENT):
Creator is ACTIVELY engaging with ${prodDesc} — not just holding it passively, but mid-interaction: ${possessive} fingers are demonstrating a feature, turning it to show a detail, pressing a button, or squeezing/testing the texture. The product is held at chest-to-chin height with ONE hand, angled naturally toward camera so the viewer can see it clearly.
The OTHER hand is mid-gesture — pointing at a specific feature on the product, OR fingers in a "chef's kiss" gesture, OR thumb-up beside it, OR hand touching ${possessive} chest in a "this changed my life" gesture. This second hand adds storytelling energy to the frame.
Face shows authentic conviction: eyes slightly squinted in a genuine smile, slight head nod frozen mid-motion, mouth open mid-word as if saying "and the BEST part is..." — this is peak recommendation energy. ${pronoun} is looking at CAMERA with direct, trustworthy eye contact while holding the product up for inspection.
Hand details on product: natural grip with visible finger pressure — not a delicate model hold. Knuckle creases deepened, slight white pressure points on fingertips where ${pronoun} grips. Product texture interacts realistically with skin — slight shadow between fingers and product surface. If the product has a button or feature, ${possessive} thumb is near it as if ${pronoun} just demonstrated something.
The ENTIRE composition communicates: "I've been using this for weeks and I genuinely recommend it." The product is the CO-STAR of the image alongside the creator's authentic enthusiasm.`;
    interactionDirective = `INTERACTION ENERGY: Peak recommendation moment — ${pronoun} is mid-sentence explaining why this product is worth it, holding it up with genuine pride and enthusiasm. Every element of body language (grip, gesture, expression, posture) reinforces authentic product belief and conviction.`;
  }

  return `Create a hyper-realistic UGC-style image of a real human creator ACTIVELY ${holdMode === "phone_app" ? "demonstrating an app on their phone" : holdMode === "product_unbox" ? "unboxing a product" : holdMode === "product_table" ? "presenting a product on their desk" : holdMode === "none" ? "speaking to camera" : "reviewing and interacting with a product"} while recording at home. PORTRAIT FORMAT 9:16 aspect ratio (vertical, like a TikTok/Reel).

CRITICAL DIRECTION: The product/app interaction must be the HERO ELEMENT of this image. The creator must be PHYSICALLY, VISIBLY, and BELIEVABLY interacting with the product — hands engaged, body language leaning in, expression showing genuine conviction. This must look like a freeze-frame from a real video where someone is passionately showing their audience something they truly believe in. Every element (hands, eyes, expression, posture) must reinforce authentic product engagement.
${interactionDirective}

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

Micro-Realism Details:
Slight camera auto-exposure fluctuation — subtle brightness shift as if the phone is adjusting mid-recording.
Minor skin texture variation across cheeks — one cheek slightly rougher or more flushed than the other.
Subtle under-eye darkness — natural fatigue shadows, not concealed, not exaggerated.
Very faint asymmetry in eyebrows — one slightly higher or thicker than the other.
Natural lip dryness texture — slight chapping or dry patches on lips, not glossy or perfectly moisturized.
Tiny facial micro-expressions — subtle tension in forehead, slight nostril flare, micro-movement frozen mid-frame.
Slight background blur noise — bokeh has subtle chromatic aberration and digital artifacts like a real phone sensor.
Very subtle digital noise like smartphone sensor — fine grain visible especially in shadow areas and skin mid-tones, consistent with iPhone front camera in natural light.

Expression conveys trust and subtle excitement, like ${pronoun} just discovered something useful and wants to share it with a friend.

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