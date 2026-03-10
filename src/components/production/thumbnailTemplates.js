// ═══════════════════════════════════════════════════════════════════════════════
// THUMBNAIL TEMPLATE LIBRARY — 14 Real-World High-CTR Templates
//
// Each template is reverse-engineered from an actual viral YouTube thumbnail.
// The imagePromptInstructions field is a battle-tested Ideogram V3 prompt
// that recreates the EXACT composition — users just swap in their characters.
// ═══════════════════════════════════════════════════════════════════════════════

export const THUMBNAIL_TEMPLATES = [

  // ═══════════════════════════════════════════════════════════════════
  // GROUP A — NOLLYWOOD / AFRICAN DRAMA & COMEDY
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'nollywood_split_reaction',
    name: 'Nollywood Split Reaction',
    genre: 'Nollywood Drama',
    groupLabel: 'Nollywood',
    groupColor: '#f5c518',
    psychology: `Two opposite emotions on a hard split screen forces the brain to resolve the conflict — the only resolution is to click. The red arrow acts as a visual imperative pointing toward mystery. The question mark withholds information deliberately. Yellow vs Blue = maximum color contrast on YouTube's UI. This is the single highest-CTR format for Nollywood drama.`,
    primaryColor: '#FFD700',
    textStrategy: `Bottom bar: Impact font, ALL CAPS white on solid black. Max 3 words. MUST end with "!" e.g. "GRANDMA EXPLODES!" Never lowercase. Never more than 3 words.`,
    beast_formula: {
      rimLight: 'Cyan glow on left char edges. Magenta glow on right char edges.',
      outerGlow: 'Subtle white outer glow behind BOTH subjects.',
      bgBlur: 'Within each half, background blurred 5-8%.',
      saturation: '+45% — vivid yellow left, deep blue right.',
      deadSpaceFix: 'Arrow + question mark fill the dangerous center gap.',
      mouthRule: 'Left char: wide open O-shape shock. Right: jaw set, no open mouth.',
      colorTheory: 'Yellow (#FFD700) vs Blue (#1a2a6c) = complementary maximum contrast.',
      skinPass: 'Surface blur skin, dodge forehead+nose bridge.',
    },
    imagePromptInstructions: `YouTube thumbnail 1920x1080. Hard vertical split divides frame exactly 50/50. LEFT HALF: vivid golden yellow background (#FFD700). RIGHT HALF: deep dark navy blue (#1a2a6c). Sharp crisp border at center, no blending. CENTER: large bold red arrow (pointing right) and large white bold question mark on right-center area. LEFT CHARACTER ZONE: space for one person — extreme open-mouth O-shape shock, eyes maximally wide, warm yellow rim light on edges, white outer glow behind. RIGHT CHARACTER ZONE: space for one person — intense confrontational stare, set jaw, cool blue rim light on edges, white outer glow behind. BOTTOM: full-width black bar (20% frame height) — leave completely empty for text overlay. +45% saturation. NO text, letters, or numbers in rendered image.`,
    referenceDescription: 'GRANDMA EXPLODES! — Shocked woman on vivid yellow left, stern woman on deep blue right. Red arrow center pointing to question mark. White Impact on black bottom bar.',
    previewImageFile: 'WhatsApp_Image_2026-03-10_at_11_56_36_AM.jpeg',
    ctrScore: 9.1,
    charCount: 2,
    bestFor: ['nollywood', 'drama'],
    signals: ['explodes', 'drama', 'confrontation', 'grandma', 'mama', 'fight', 'shocking', 'betrayal', 'nollywood', 'exposes'],
  },

  {
    id: 'nollywood_movie_poster_duo',
    name: 'Nollywood Movie Poster — Duo',
    genre: 'Nollywood Drama',
    groupLabel: 'Nollywood',
    groupColor: '#f5c518',
    psychology: `Movie poster format signals premium professional production — elevates perceived content quality. Matching costumes create team tension. One stoic + one shocked face = contrast principle. Gold gradient title creates an immediate visual anchor. Studio name adds legitimacy.`,
    primaryColor: '#2a6bd6',
    textStrategy: `Large bold title in right 40% of frame, gold-to-orange gradient Impact font. Studio name smaller above. Channel badge bottom-left. Cast names bottom. Max 2-word title.`,
    beast_formula: {
      rimLight: 'Warm white studio rim on both subjects from 3-point lighting.',
      outerGlow: 'Subtle halo behind both characters.',
      bgBlur: 'Interior background blurred 8%, subjects razor sharp.',
      saturation: '+30%, slight cool blue grade on background.',
      deadSpaceFix: 'Gold title fills entire right half. Lightning bolts fill gaps.',
      mouthRule: 'One stoic (quality signal) + one shocked (drama signal) = contrast.',
      colorTheory: 'Warm gold title vs cool blue tones = highest contrast.',
      skinPass: 'Warm skin tone boost vs cool background.',
    },
    imagePromptInstructions: `YouTube thumbnail 1920x1080. Nollywood movie poster. BACKGROUND: blurred cinematic interior (office/home/hospital), 8% blur. LEFT 60%: two people side-by-side in matching uniforms — LEFT: calm stoic expression; CENTER-RIGHT: shocked open mouth wide eyes. Both: warm studio rim lighting, white outer glow. Small red lightning bolt accents near them. RIGHT 40%: completely clean — leave for large gold-gradient title text overlay. TOP-RIGHT: small area empty for studio name. BOTTOM-LEFT: empty for YouTube badge. BOTTOM-RIGHT: empty for cast names. NO text in image.`,
    referenceDescription: 'DOMESTIC WAR — Two women in matching blue nurse uniforms (left calm, right shocked). Blurred hospital bg. Gold gradient "DOMESTIC WAR" Impact right side. Lightning bolts. Studio + channel labels.',
    previewImageFile: 'WhatsApp_Image_2026-03-10_at_11_56_36_AM__1_.jpeg',
    ctrScore: 8.6,
    charCount: 2,
    bestFor: ['nollywood', 'drama'],
    signals: ['domestic', 'war', 'servants', 'workers', 'house help', 'conflict', 'nollywood', 'movie', 'film'],
  },

  {
    id: 'nollywood_ensemble_comedy',
    name: 'Nollywood Ensemble — Solo vs Crowd',
    genre: 'Nollywood Comedy',
    groupLabel: 'Nollywood',
    groupColor: '#f5c518',
    psychology: `The "outsider vs crowd" creates instant curiosity — why is one person serious while everyone celebrates? Fist pump = dominance/power. Massive gold title anchors the bottom. Contrast between calm solo and warm celebratory crowd triggers pattern recognition that demands resolution via click.`,
    primaryColor: '#f5c518',
    textStrategy: `Massive solid gold Impact text at bottom spanning full width. One concept, 2-4 ALL CAPS words. No outline needed at this size. e.g. "NEXT OF KIN".`,
    beast_formula: {
      rimLight: 'Warm golden rim on hero char, cooler subtle rim on solo char.',
      outerGlow: 'Hero character has strongest white outer glow.',
      bgBlur: 'Group in bg slightly soft-focused, hero and solo sharp.',
      saturation: '+40% on group. -10% on solo to increase contrast.',
      deadSpaceFix: 'Gold title fills entire bottom strip. Fist fills center.',
      mouthRule: 'Hero: genuine laughing open mouth. Solo: closed stoic.',
      colorTheory: 'Warm gold palette throughout = aspirational wealth aesthetic.',
      skinPass: 'Warm skin on group. Slightly cooler/dimmer on solo.',
    },
    imagePromptInstructions: `YouTube thumbnail 1920x1080. FAR LEFT (20%): one calm man with thin-frame glasses, stoic slight smile, medium size, slightly desaturated — dark jacket. BACKGROUND RIGHT (40%): 5-6 diverse people on stylish teal sofa, laughing, celebrating, holding drinks — warm vibrant. FOREGROUND RIGHT (40%): hero figure, LARGEST element on screen — red jersey, gold chain, massive genuine laughing grin, raised closed fist with beaded bracelet. BACKGROUND: modern lounge, brick wall. BOTTOM: large empty zone (25% frame height) for massive gold Impact title. Warm golden color grade, +40% saturation on group. NO text in image.`,
    referenceDescription: 'NEXT OF KIN — Stoic glasses man far-left vs laughing group + hero in red jersey with raised fist. Modern lounge. Massive gold "NEXT OF KIN" Impact text bottom.',
    previewImageFile: 'WhatsApp_Image_2026-03-10_at_11_56_36_AM__2_.jpeg',
    ctrScore: 8.8,
    charCount: 3,
    bestFor: ['nollywood', 'comedy'],
    signals: ['next of kin', 'family', 'inheritance', 'will', 'rich', 'comedy', 'nollywood', 'celebration'],
  },

  {
    id: 'nollywood_ensemble_poster',
    name: 'Nollywood 5-Character Ensemble Poster',
    genre: 'Nollywood Comedy-Drama',
    groupLabel: 'Nollywood',
    groupColor: '#f5c518',
    psychology: `Five distinct faces = five subplots = high perceived replay value. Disguised center character creates secret identity hook. Strong single-color background unifies all characters. Sequel number signals proven franchise. The cast names strip gives it a Netflix-level quality feel.`,
    primaryColor: '#c0392b',
    textStrategy: `3D embossed gold title center-bottom. Sequel number in contrasting cyan/teal. Studio name above in small white text. Cast names in tiny white strip at very bottom. Right-side tagline in cyan italic.`,
    beast_formula: {
      rimLight: 'Studio key light from slightly above on all characters.',
      outerGlow: 'Subtle white halo on center character only.',
      bgBlur: 'Flat single-color bg — no blur needed.',
      saturation: '+35%, warm brick red stays vivid.',
      deadSpaceFix: 'Every corner has a face. Title fills center. Tagline fills top-right.',
      mouthRule: 'Mix: 2 neutral, 2 dramatic, 1 playful.',
      colorTheory: 'Warm brick red + cyan text = warm/cool maximum contrast.',
      skinPass: 'Warm skin tone boost on all chars against warm bg.',
    },
    imagePromptInstructions: `YouTube thumbnail 1920x1080. Nollywood ensemble movie poster. BACKGROUND: solid warm brick red (#c0392b), flat no texture. FIVE CHARACTERS composited professionally: CENTER-TOP (largest): person in grey flat cap, pencil-line fake mustache, grey turtleneck under black blazer, mysterious neutral expression. TOP-LEFT: young woman in pink feathered glamour jacket, worried/dramatic look. TOP-RIGHT: tall man in dark elegant suit, confident smirk. BOTTOM-LEFT: bearded man in textured suit, pensive looking upward. BOTTOM-RIGHT: woman in grey layered outfit, cute playful expression. All: studio key lighting from above-front, warm skin. CENTER-BOTTOM: large empty area for 3D title text. BOTTOM STRIP: tiny empty for cast names. TOP-RIGHT: small empty area for tagline. NO text in image.`,
    referenceDescription: 'RUSE 2 — 5 chars on brick red. Center: disguised figure in cap/mustache. Corners: glamour woman, suit man, pensive man, playful woman. Gold 3D "RUSE" with cyan "2". Cast names bottom.',
    previewImageFile: 'WhatsApp_Image_2026-03-10_at_11_56_36_AM__3_.jpeg',
    ctrScore: 8.4,
    charCount: 3,
    bestFor: ['nollywood', 'drama', 'comedy'],
    signals: ['ruse', 'sequel', 'disguise', 'identity', 'movie', 'nollywood', 'film', 'part 2', 'scheme'],
  },

  {
    id: 'nollywood_sunset_cinematic',
    name: 'Nollywood Cinematic Sunset',
    genre: 'Nollywood Drama',
    groupLabel: 'Nollywood',
    groupColor: '#f5c518',
    psychology: `Warm sunset palette = aspiration, hope, feel-good drama. Three characters at different scales create depth and hierarchy. The disguised foreground character draws curiosity. The confident smiling background character promises resolution. Mystery + resolution = the classic click hook.`,
    primaryColor: '#e07b39',
    textStrategy: `Large gold-to-orange gradient title right side (40% of frame). Movie poster weight font. Studio name top-right above title. Channel badge bottom-left. Cast names bottom-right.`,
    beast_formula: {
      rimLight: 'Warm orange sunset glow on all chars from above-right.',
      outerGlow: 'Golden outer glow behind all three subjects.',
      bgBlur: 'Sky bg blurred 8%, subjects razor sharp.',
      saturation: '+50% warm tone — maximum sunset saturation.',
      deadSpaceFix: 'Title fills right half. Village houses fill bg corners.',
      mouthRule: 'Foreground: mysterious closed. Background: confident smile + playful smile.',
      colorTheory: 'Warm orange/gold throughout — aspirational optimistic.',
      skinPass: 'Warm golden hour skin grade on all chars.',
    },
    imagePromptInstructions: `YouTube thumbnail 1920x1080. Nollywood cinematic. BACKGROUND: dramatic warm sunset sky — deep orange, red, golden clouds, golden hour light. Colorful village houses silhouetted in bg corners. LEFT 60%: THREE CHARACTERS at different depths — FOREGROUND CENTER-LEFT (largest): person in grey flat cap, pencil-line mustache marks, dark turtleneck/jacket, mysterious neutral expression, slightly in front; BACKGROUND LEFT (medium): young woman in bright colored dress, playful happy smile; BACKGROUND RIGHT (large): tall confident man in brown/dark suit, very broad warm smile, open gesture. RIGHT 40%: clean — for title text overlay. BOTTOM-LEFT: empty for channel badge. BOTTOM-RIGHT: empty for cast names. All: warm golden lighting, outer glow. NO text in image.`,
    referenceDescription: 'RUSE — Disguised hero foreground center-left, playful woman bg left, confident man bg right. Dramatic sunset sky. Gold gradient "RUSE" right side. Channel badge + cast names.',
    previewImageFile: 'WhatsApp_Image_2026-03-10_at_11_56_36_AM__4_.jpeg',
    ctrScore: 8.5,
    charCount: 3,
    bestFor: ['nollywood', 'drama'],
    signals: ['cinematic', 'drama', 'sunset', 'scheme', 'identity', 'nollywood', 'movie'],
  },

  {
    id: 'nollywood_sky_ensemble',
    name: 'Nollywood Sky Ensemble Comedy',
    genre: 'Nollywood Comedy',
    groupLabel: 'Nollywood',
    groupColor: '#f5c518',
    psychology: `Open sky = freedom and optimism = comedy genre signal. Five diverse characters in Nigerian cultural costumes create instant identity recognition. Center figure looking upward at cross = divine comedy irony that is inherently funny. Playful 3D bubbly title signals pure entertainment.`,
    primaryColor: '#4db8ff',
    textStrategy: `Large 3D bubble-style title at bottom-center. Yellow with thick purple/violet outline glow. Font must feel like animation title or game logo. Cast names tiny white strip at very bottom.`,
    beast_formula: {
      rimLight: 'Sky-blue natural rim from above on all characters.',
      outerGlow: 'Bright sky creates natural outer glow on all subjects.',
      bgBlur: 'Sky bg 6% blur, characters sharp.',
      saturation: '+40% vivid blue sky, warm character skin tones.',
      deadSpaceFix: 'Cross fills bg center. 3D title fills entire bottom.',
      mouthRule: 'Center: wide open laugh. Far-left: worried. Others: varied smiles.',
      colorTheory: 'Vivid blue sky + yellow title = complementary contrast.',
      skinPass: 'Warm skin boost against cool blue sky.',
    },
    imagePromptInstructions: `YouTube thumbnail 1920x1080. Nigerian Nollywood comedy. BACKGROUND: vivid bright blue sky with water/ocean horizon, very high saturation. Dark church cross silhouetted in bg center. FIVE CHARACTERS across full width: FAR LEFT: woman in dark hijab, concerned expression looking away. LEFT-CENTER: tall man in yellow traditional shirt, genuine smile, raised hand blessing. CENTER (LARGEST, foreground): man in tall white conical religious hat and long flowing white robe, mouth wide open laughing, looking upward at sky. RIGHT-CENTER: man in colorful traditional head wrap with sunglasses, cool confident smile. FAR RIGHT: young man in white and blue robe, wide surprised eyes. BOTTOM CENTER: large empty area for 3D bubble title. VERY BOTTOM: tiny strip for cast names. Sky-blue lighting from above. +40% saturation. NO text in image.`,
    referenceDescription: 'WOLI SHAGGI — 5 chars against blue sky. Cross in bg. Center figure in tall white religious hat laughing upward. Yellow 3D bubble "WOLI SHAGGI" with purple glow at bottom. Cast names.',
    previewImageFile: 'WhatsApp_Image_2026-03-10_at_11_56_37_AM.jpeg',
    ctrScore: 8.7,
    charCount: 3,
    bestFor: ['nollywood', 'comedy'],
    signals: ['woli', 'shaggi', 'prophet', 'church', 'religion', 'comedy', 'nigerian', 'ensemble', 'brodashaggi'],
  },

  {
    id: 'nollywood_series_split_chef',
    name: 'Branded Series — Chef vs Street',
    genre: 'Nollywood Web Series',
    groupLabel: 'Nollywood',
    groupColor: '#f5c518',
    psychology: `Blue background + floating food = instant branded series recognition. Diagonal divider creates two contrasting worlds. Chef vs street = class/lifestyle contrast creates instant comedy tension. Series logo top-right builds brand recognition across episodes.`,
    primaryColor: '#4488ee',
    textStrategy: `TWO-TIER: (1) Series logo top-right + Episode number below it. (2) Episode title bottom-left, bold green outlined text with coin/money icon. Title names the plot concept directly.`,
    beast_formula: {
      rimLight: 'Cool studio rim on both from off-camera left.',
      outerGlow: 'Subtle rim glow on both against blue bg.',
      bgBlur: 'Flat blue bg, no blur needed.',
      saturation: '+50% vivid blue, high saturation food items.',
      deadSpaceFix: 'Floating vegetables fill all bg gaps. Logo fills top-right.',
      mouthRule: 'Both: stoic closed mouth — cool/confident energy.',
      colorTheory: 'Vivid blue + green text = fresh food-show aesthetic.',
      skinPass: 'Clean neutral skin on blue background.',
    },
    imagePromptInstructions: `YouTube thumbnail 1920x1080. Branded Nollywood web series. BACKGROUND: vivid royal blue (#4488ee) with scattered floating cartoon vegetables — tomatoes, green lettuce leaves, red chili peppers at various sizes/angles. WHITE DIAGONAL DIVIDER cutting from upper-center to lower-center (15-degree angle). LEFT OF DIVIDER: person in full white chef uniform with tall chef hat, holding plate of orange jollof rice, suspicious side-eye expression looking right. RIGHT OF DIVIDER (FOREGROUND, SLIGHTLY LARGER): person in casual streetwear with pink beanie hat, holding colorful toy/nerf gun pointed outward, cool stoic expression. TOP-RIGHT: clean empty area for series logo + episode number. BOTTOM-LEFT: clean empty area for episode title text. NO text in image.`,
    referenceDescription: 'SHAGGI PALAVA Ep 8 — GLOBAL INVEST: Blue bg + floating veggies. Diagonal divider. Chef (side-eye + rice) left, streetwear+nerf gun right. Series logo top-right. Green "GLOBAL INVEST" bottom-left.',
    previewImageFile: 'WhatsApp_Image_2026-03-10_at_11_56_37_AM__1_.jpeg',
    ctrScore: 8.3,
    charCount: 2,
    bestFor: ['nollywood', 'comedy'],
    signals: ['palava', 'series', 'episode', 'chef', 'cook', 'food', 'comedy', 'web series', 'invest', 'street'],
  },

  {
    id: 'nollywood_series_split_glam',
    name: 'Branded Series — Glamour vs Chaos',
    genre: 'Nollywood Web Series',
    groupLabel: 'Nollywood',
    groupColor: '#f5c518',
    psychology: `Elegant vs chaotic contrast — the visual joke tells the episode story without words. Angel halo on the glamorous one and devil wings near the title add religious irony that Nollywood audiences love. Same blue branded background signals "this is part of a series I follow."`,
    primaryColor: '#4488ee',
    textStrategy: `Same two-tier series format. Episode title bottom-left with small angel halo (😇) and devil wing (🦇) decorative icons flanking the text. This visual contrast reinforces the episode theme.`,
    beast_formula: {
      rimLight: 'Warm glamour rim on left. Messy warm light on right (eating chaos).',
      outerGlow: 'Both subjects subtle outer glow against blue.',
      bgBlur: 'Flat blue, no blur.',
      saturation: '+50%.',
      deadSpaceFix: 'Floating food + halo + wings fill all gaps.',
      mouthRule: 'Char1: composed slight pout. Char2: wide open biting food maniacally.',
      colorTheory: 'Blue + green title = consistent series brand palette.',
      skinPass: 'Glamour skin on char1 (smooth highlight cheekbones). Expressive raw on char2.',
    },
    imagePromptInstructions: `YouTube thumbnail 1920x1080. Branded Nollywood web series. BACKGROUND: vivid royal blue (#4488ee) with scattered floating cartoon vegetables — tomatoes, red peppers, green leaves. WHITE DIAGONAL DIVIDER center. LEFT OF DIVIDER: elegant glamorous woman in stylish dark evening wear or sparkly top, full glam makeup, very composed slight-pout expression — composed and beautiful, NOT smiling. Small golden angel halo floating above her head. Studio key lighting. RIGHT OF DIVIDER (FOREGROUND, LARGER): large man in chef whites and tall chef hat, maniacally biting into a chicken drumstick with both hands, eyes wide open in exaggerated pleasure, mouth wide open eating aggressively. Both professionally composited on blue bg. TOP-RIGHT: clean area for series logo. BOTTOM-LEFT: clean area for episode title text. NO text in image.`,
    referenceDescription: 'SHAGGI PALAVA Ep 5 — ANGEL OF DEATH: Blue bg + floating veggies. Diagonal split. Elegant woman with angel halo left, chef eating chicken wildly right. Angel+devil wing text icons. Green "ANGEL OF DEATH" bottom-left.',
    previewImageFile: 'WhatsApp_Image_2026-03-10_at_11_56_37_AM__2_.jpeg',
    ctrScore: 8.4,
    charCount: 2,
    bestFor: ['nollywood', 'comedy'],
    signals: ['angel', 'death', 'episode', 'series', 'comedy', 'food', 'chef', 'glamour', 'palava', 'contrast'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // GROUP B — TRUE CRIME / MYSTERY
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'true_crime_dark_reveal',
    name: 'True Crime — Dark Reveal',
    genre: 'True Crime / Mystery',
    groupLabel: 'True Crime',
    groupColor: '#cc0000',
    psychology: `Near-black background + surveillance footage = forbidden knowledge. Attractive face next to darkness creates cognitive dissonance — viewer can't reconcile "normal person" with "crime scene" and must click. "DEAD BODIES" triggers morbid curiosity hardwired by evolution. Grainy CCTV footage makes it feel real and exclusive.`,
    primaryColor: '#1a1a2e',
    textStrategy: `"The Evidence" strategy: specific location + ominous noun. Bold white text with red drop shadow. Under 5 words. Never use quotes. e.g. "HOUSE OF DEAD BODIES" — specific + shocking.`,
    beast_formula: {
      rimLight: 'Single dramatic key light from right on face only.',
      outerGlow: 'None — darkness IS the separation.',
      bgBlur: 'Heavy black vignette around all edges.',
      saturation: '-30% desaturated with strong red tint overlay.',
      deadSpaceFix: 'Surveillance footage image fills right half.',
      mouthRule: 'Closed mouth — calm before the storm.',
      colorTheory: 'Near-black + deep red vignette = dread and danger.',
      skinPass: 'Desaturated skin, high contrast dramatic key light.',
    },
    imagePromptInstructions: `YouTube thumbnail 1920x1080. True crime aesthetic. BACKGROUND: near-black with deep crimson-red vignette bleeding inward from all edges (very heavy, 95% strength). LEFT 50%: attractive young person with natural warm expression, calm, slightly smiling — normal everyday look. Single dramatic key light from right side only. Desaturated skin (-30%), high contrast. RIGHT SIDE: grainy CCTV surveillance footage aesthetic — dark building exterior at night, slightly green CCTV tint, low quality, blurry, ominous. Small bright detection circle drawn around something suspicious. TOP CENTER: large empty area for bold white title text with red drop shadow. Overall: -30% desaturated color grade, red tint overlay, heavy black vignette. NO text in image.`,
    referenceDescription: 'HOUSE OF DEAD BODIES — Attractive calm person left half, dark grainy surveillance footage of building right. Heavy dark vignette throughout. Bold white title text at top.',
    previewImageFile: '1773169850589_image.png',
    ctrScore: 9.3,
    charCount: 1,
    bestFor: ['crime'],
    signals: ['dead', 'bodies', 'house', 'murder', 'crime', 'killed', 'disappeared', 'missing', 'found', 'investigation', 'exposed'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // GROUP C — MRBEAST "BEAST FORMULA"
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'beast_spectacle_money',
    name: 'Beast Formula — Spectacle Money Pile',
    genre: 'Challenge / Viral',
    groupLabel: 'MrBeast Formula',
    groupColor: '#00C853',
    psychology: `"Dead Space Ban" in action — every pixel filled with spectacle. Two faces at different scales = visual hierarchy. Money pile at 150% impossible scale = Candy Store color theory. Buried-in-money figure creates physical immersion. BOTH open mouths = maximum energy signal. Cyan rim light is the MrBeast signature move.`,
    primaryColor: '#00C853',
    textStrategy: `Often NO text — the image IS the story. If needed: single number or short ALL CAPS word, white Impact with thick black outline, upper zone only. e.g. "$1,000,000" or "I WON".`,
    beast_formula: {
      rimLight: 'MANDATORY: Cyan (#00FFFF) on char1 left edges. Magenta (#FF00FF) on char2 edges.',
      outerGlow: 'White outer glow halo behind BOTH subjects.',
      bgBlur: 'Money pile bg slightly soft, faces razor sharp.',
      saturation: '+45% — money green + cyan sky = candy store.',
      deadSpaceFix: 'ZERO dead space — money fills EVERY pixel of background.',
      mouthRule: 'BOTH: maximum open mouth shock/joy. Absolutely no stoic faces.',
      colorTheory: 'Cyan + green money + magenta accent = MrBeast signature palette.',
      skinPass: 'Surface blur skin, dodge T-zone (forehead+nose), burn cheekbones for 3D.',
    },
    imagePromptInstructions: `YouTube thumbnail 1920x1080. MrBeast-style challenge. BACKGROUND: vivid cyan-blue sky (#00b4d8). ENTIRE MIDDLE AND BACKGROUND: massive impossible mountain of US $100 dollar bills — thousands of bills completely filling the background, larger than humans. FOREGROUND LEFT (40%): energetic person in branded black graphic t-shirt, mouth WIDE open in maximum joy/excitement, huge wide eyes — CYAN rim light (#00FFFF) on LEFT body edges, white outer glow halo behind, surface-blurred skin with glowing forehead. CENTER-RIGHT (buried in money pile): person emerging neck-deep from bills, arms raised holding $100 bills in both hands, shocked open-mouth expression — MAGENTA rim light (#FF00FF) on their edges, white outer glow. UPPER AREA: leave clean for optional title text. +45% saturation, candy store aesthetic. NO text in image.`,
    referenceDescription: 'MrBeast challenge — Person left (open-mouth screaming, branded shirt) + person buried center-right in $100 bills. Cyan sky. Cyan rim on char1, magenta on buried char. Beast Formula skin treatment.',
    previewImageFile: '1773169955563_image.png',
    ctrScore: 9.8,
    charCount: 2,
    bestFor: ['finance', 'comedy', 'challenge'],
    signals: ['million', 'money', 'cash', 'challenge', 'prize', 'win', 'competition', 'viral', 'gave away', 'spent', '$'],
  },

  {
    id: 'beast_arrow_showcase',
    name: 'Beast Formula — Arrow Object Showcase',
    genre: 'Tutorial / Challenge',
    groupLabel: 'MrBeast Formula',
    groupColor: '#00C853',
    psychology: `Arrow as "visual imperative" — forces the eye to the product and makes ignoring it psychologically impossible. Object scaled to 150% real-world size = impossible spectacle. Windows-XP-green background is the most optimistic energetic color in existence. CTA text breaks the fourth wall and directly commands the viewer.`,
    primaryColor: '#4caf50',
    textStrategy: `Bold ALL CAPS CTA text top-right. Neon green (#00ff00) with thick black outline (4px). Max 3 words. e.g. "WIN THIS!" or "EDIT ME!" or "YOU WON!"`,
    beast_formula: {
      rimLight: 'Cyan (#00FFFF) on character edges. Gold warm rim on object edges.',
      outerGlow: 'White outer glow behind character. Sun flare behind object.',
      bgBlur: 'XP grass bg slightly blurred. Char and object razor sharp.',
      saturation: '+50% — maximum candy store green.',
      deadSpaceFix: 'Object fills right 55%. Arrow fills the gap between char and object.',
      mouthRule: 'Maximum open mouth excitement — tongue visible is fine.',
      colorTheory: 'Green bg + red arrow = maximum contrast. Yellow object = pop.',
      skinPass: 'Aggressive surface blur, bright eyes, glowing T-zone.',
    },
    imagePromptInstructions: `YouTube thumbnail 1920x1080. MrBeast showcase style. BACKGROUND: vivid bright Windows XP aesthetic — lush green rolling hills with bright blue sky and white clouds, very high saturation (+50%). LEFT 45%: excited person in bright yellow/orange jacket, mouth WIDE open showing maximum excitement (tongue visible fine), massive wide eyes — CYAN rim light (#00FFFF) on body edges, white outer glow behind. BETWEEN CHAR AND OBJECT: large bold curved red arrow pointing RIGHT toward object, with small floating app icon/badge near it. RIGHT 55%: massive yellow Lamborghini Aventador (or equivalent luxury prize) — scaled 150% of realistic size, gleaming, gold warm rim light on edges, sun reflection on hood. TOP RIGHT CORNER: clean empty zone for bright green ALL CAPS title text with black outline. Hyper-saturated, ultra-sharp, Beast-style. NO text in image.`,
    referenceDescription: 'MrBeast tutorial — Person in yellow jacket (massive open mouth) left, large red curved arrow center, massive yellow Lamborghini right (150% scale). Windows XP green bg. "EDIT ME!" neon green Impact top-right. Small Photoshop icon.',
    previewImageFile: '1773169972380_image.png',
    ctrScore: 9.5,
    charCount: 1,
    bestFor: ['educational', 'challenge', 'finance'],
    signals: ['win', 'won', 'car', 'prize', 'tutorial', 'how to', 'edit', 'photoshop', 'bought', 'lamborghini', 'challenge', 'gave'],
  },

  // ═══════════════════════════════════════════════════════════════════
  // GROUP D — DOAC / PODCAST / THOUGHT LEADERSHIP
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'doac_quote_center',
    name: 'DOAC — Provocative Quote Card',
    genre: 'Podcast / Thought Leadership',
    groupLabel: 'DOAC / Podcast',
    groupColor: '#e5e7eb',
    psychology: `"The Quote" strategy — direct controversial statement in quotation marks makes viewers mentally agree or disagree. Both reactions lead to a click. White text on pure black = maximum legibility + premium credibility. Red highlight on key shocking word is a heat-seeking missile for the eye. Two faces with microphones signals "experts talking."`,
    primaryColor: '#ffffff',
    textStrategy: `Large white sans-serif quote text CENTER of frame — must have quotation marks. ONE key word gets red rectangle highlight box behind it. Number format performs best: "5 things X won't tell you!" Brand badge top-left in white box.`,
    beast_formula: {
      rimLight: 'Single key light on each face. Pure black = natural separation.',
      outerGlow: 'None needed — black bg provides natural contrast.',
      bgBlur: 'No blur — pure black background.',
      saturation: '-10% neutral documentary grade.',
      deadSpaceFix: 'Quote text fills entire center. Faces flank left and right.',
      mouthRule: 'Char1: speaking (slight jaw movement). Char2: intense listening (composed).',
      colorTheory: 'Black + white + red = highest contrast editorial palette.',
      skinPass: 'Neutral natural broadcast quality skin tones.',
    },
    imagePromptInstructions: `YouTube thumbnail 1920x1080. Premium podcast format. BACKGROUND: pure solid black (#000000). LEFT 25%: person speaking intensely, mid-word jaw position, studio condenser microphone visible in lower portion of their zone, dramatic key lighting from left only — no other light. RIGHT 25%: person listening with powerful intense direct gaze at camera, chin slightly raised, confident composure, studio microphone visible — key light from right. CENTER 50%: completely empty — leave clear for large white quote text + red highlight rectangle overlay. TOP LEFT CORNER: small empty rectangle for brand badge. Both subjects: natural broadcast skin tones, dark shirts preferred. NO text in image.`,
    referenceDescription: 'DOAC — Black bg. Left: speaker mid-word with studio mic + dramatic key light. Right: intense listener with mic. Center: large white quote text with red "AI" highlight box. "DOAC" brand badge white box top-left.',
    previewImageFile: '1773170083821_image.png',
    ctrScore: 9.2,
    charCount: 2,
    bestFor: ['educational', 'finance', 'ai'],
    signals: ['podcast', 'AI', 'things they', 'not telling', 'truth', 'reveal', 'interview', 'discussion', '5 things', 'secrets'],
  },

  {
    id: 'doac_bold_statement',
    name: 'DOAC — Urgent Bold Statement',
    genre: 'Podcast / AI / Career',
    groupLabel: 'DOAC / Podcast',
    groupColor: '#e5e7eb',
    psychology: `"The Statement" formula — present tense urgent claim with a specific timeframe creates maximum fear of missing out. "24 months" = highly specific = more believable than vague. Personal threat language triggers self-preservation instinct to click. Older expert + intense young host = credibility + gravitas.`,
    primaryColor: '#ffffff',
    textStrategy: `Large bold lowercase white statement. One key verb/noun gets red rectangle highlight. Must include specific number for urgency. Format: "[these/your] X won't [verb] in [N] months!" Brand badge top-left.`,
    beast_formula: {
      rimLight: 'Subtle key light on each. Black bg separates naturally.',
      outerGlow: 'None.',
      bgBlur: 'Pure black, no blur.',
      saturation: 'Neutral documentary.',
      deadSpaceFix: 'Statement text fills entire center.',
      mouthRule: 'Expert: mid-speech. Host: intense closed-mouth stare.',
      colorTheory: 'Black + white + red = maximum trust + urgency.',
      skinPass: 'Natural neutral skin, no heavy processing.',
    },
    imagePromptInstructions: `YouTube thumbnail 1920x1080. Premium interview format. BACKGROUND: pure solid black (#000000). LEFT 25%: older distinguished expert (grey-haired, 55-65 years old), concerned urgent expression, mid-explanation gesture, slight forward lean — single dramatic key light from left, natural skin. RIGHT 25%: younger confident host, powerful intense direct gaze at camera, chin slightly raised, no microphone visible — key light from right. CENTER 50%: completely empty — leave clear for large white bold statement text + red rectangle highlight overlay. TOP-LEFT CORNER: small empty rectangle for brand badge. NO text in image.`,
    referenceDescription: 'DOAC — Black bg. Left: older grey-haired expert explaining (mid-speech). Right: younger host with intense direct stare. Center: "these jobs won\'t exist in 24 months!" red "exist" highlight. DOAC badge top-left.',
    previewImageFile: '1773170096442_image.png',
    ctrScore: 9.4,
    charCount: 2,
    bestFor: ['ai', 'educational', 'finance'],
    signals: ['jobs', 'AI', 'exist', 'months', 'career', 'automation', 'future', 'replaced', 'won\'t', 'skills', 'work'],
  },

  {
    id: 'doac_wealth_challenge',
    name: 'DOAC — Wealth Belief Challenge',
    genre: 'Finance / Self-Help',
    groupLabel: 'DOAC / Podcast',
    groupColor: '#e5e7eb',
    psychology: `"The Identity Challenge" — challenges a deeply held belief (hard work = success) which forces defensive clicking. Woman as the challenger breaks expectations and increases curiosity. The thoughtful male chin-rest pose mirrors the viewer's own cognitive processing. No microphones = intimate conversation.`,
    primaryColor: '#ffffff',
    textStrategy: `Same DOAC lowercase bold white statement. Highlight the financial/wealth keyword in red. No number needed — conceptual shock IS the hook. e.g. "hard work doesn't build wealth!" Brand badge top-left.`,
    beast_formula: {
      rimLight: 'Matching key lights, clean broadcast professional setup.',
      outerGlow: 'None.',
      bgBlur: 'Pure black, no blur.',
      saturation: 'Neutral documentary.',
      deadSpaceFix: 'Statement fills center.',
      mouthRule: 'Woman: speaking passionately (mouth slightly open). Man: closed thoughtful.',
      colorTheory: 'Black + white + red = premium editorial finance.',
      skinPass: 'Clean natural skin tones, professional broadcast standard.',
    },
    imagePromptInstructions: `YouTube thumbnail 1920x1080. Premium finance podcast format. BACKGROUND: pure solid black (#000000). LEFT 25%: confident professional woman in elegant dark top (black or navy), speaking passionately, slight forward lean, engaged expression, mouth slightly parted mid-speech — no microphone, single key light from slightly left. RIGHT 25%: composed male host in dark fitted top, thoughtful chin-rest pose (hand/fingers near chin), slight skeptical-intrigued raised eyebrow, powerful direct gaze — key light from slightly right. CENTER 50%: completely empty — for bold white statement text with red highlight rectangle. TOP-LEFT CORNER: empty for brand badge. No microphones visible. NO text in image.`,
    referenceDescription: 'DOAC — Black bg. Left: professional woman speaking passionately (no mic). Right: male host with thoughtful chin-rest. Center: "hard work doesn\'t build wealth!" with red "build" highlight. DOAC badge top-left.',
    previewImageFile: '1773170126868_image.png',
    ctrScore: 9.1,
    charCount: 2,
    bestFor: ['finance', 'educational', 'inspirational'],
    signals: ['wealth', 'hard work', 'rich', 'money', 'build', 'success', 'financial', 'mindset', 'doesn\'t', 'invest', 'passive'],
  },

];

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE GROUPS — for UI filter tabs
// ═══════════════════════════════════════════════════════════════════════════
export const TEMPLATE_GROUPS = [
  { id: 'Nollywood',       label: '🎬 Nollywood',           color: '#f5c518', textColor: '#000' },
  { id: 'True Crime',      label: '🔪 True Crime',          color: '#cc0000', textColor: '#fff' },
  { id: 'MrBeast Formula', label: '⚡ MrBeast Formula',     color: '#00C853', textColor: '#000' },
  { id: 'DOAC / Podcast',  label: '🎙 Podcast / Interview', color: '#e5e7eb', textColor: '#000' },
];

// ═══════════════════════════════════════════════════════════════════════════
// buildTemplatePrompt — assembles full Ideogram prompt for a chosen template
// ═══════════════════════════════════════════════════════════════════════════
export function buildTemplatePrompt(template, { title = '', overlayText = '', charCount = 1, charDescriptions = [] } = {}) {
  if (!template) return '';
  const charSection = charDescriptions.filter(Boolean).length > 0
    ? `USER-PROVIDED CHARACTERS (use these as the human subjects in this composition): ${charDescriptions.map((d, i) => `Person ${i + 1}: ${d}`).join('. ')}.`
    : `Generate ${charCount} photorealistic character${charCount > 1 ? 's' : ''} appropriate for content titled: "${title}".`;
  return `
${template.imagePromptInstructions}

${charSection}

VIDEO TITLE CONTEXT: "${title}"
OVERLAY TEXT (do NOT render in image — leave designated area empty): "${overlayText}"

MANDATORY BEAST FORMULA:
- Rim light: ${template.beast_formula?.rimLight || 'Subtle rim light on all subjects.'}
- Skin: ${template.beast_formula?.skinPass || 'Natural professional quality.'}
- Saturation: ${template.beast_formula?.saturation || '+35% color saturation.'}
- Mouth rule: ${template.beast_formula?.mouthRule || 'Expression appropriate to mood.'}
- Dead space: ${template.beast_formula?.deadSpaceFix || 'Fill all empty pixels with relevant elements.'}

ABSOLUTE RULES:
- NO text, letters, numbers, words anywhere in the rendered image
- Leave ALL designated text zones completely empty and clean
- 1920×1080 ultra high resolution
- Razor-sharp faces, slightly softer background
- Professional studio-grade compositing quality
`.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// recommendTemplates — auto-recommend based on video title/summary keywords
// ═══════════════════════════════════════════════════════════════════════════
export function recommendTemplates(title = '', summary = '', maxResults = 3) {
  const text = `${title} ${summary}`.toLowerCase();
  const scored = THUMBNAIL_TEMPLATES.map(t => {
    let score = 0;
    t.signals.forEach(s => { if (text.includes(s)) score += 2; });
    if (/murder|dead|crime|kill|victim|missing/.test(text) && t.bestFor.includes('crime')) score += 4;
    if (/nollywood|nigerian|naija|yoruba|igbo|bimbo|sonia|brodashaggi/.test(text) && t.bestFor.includes('nollywood')) score += 5;
    if (/million|money|cash|rich|invest|earn|\$/.test(text) && t.bestFor.includes('finance')) score += 3;
    if (/podcast|interview|episode|discuss/.test(text) && t.bestFor.includes('educational')) score += 2;
    return { template: t, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, maxResults).map(s => s.template);
}
