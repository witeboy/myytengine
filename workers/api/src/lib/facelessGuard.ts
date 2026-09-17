// Guarantees the faceless-mannequin look in the prompt text itself.
//
// WHY THIS EXISTS
// ---------------
// The style rules already tell the model, in capitals, that EVERY figure is a faceless
// porcelain mannequin. It still writes "a gentleman in a top hat" for a background or
// authority figure, and the image generator dutifully paints a human face — one real
// face in a crowd of masks ruins the shot. Telling a model harder does not make it
// deterministic; rewriting the prompt does.
//
// So: every person named in the prompt is given the mannequin head, facial descriptions
// are removed, and a closing guarantee covers anyone the scan missed.

const PERSON_NOUNS = [
  'man', 'men', 'woman', 'women', 'gentleman', 'gentlemen', 'lady', 'ladies',
  'boy', 'boys', 'girl', 'girls', 'child', 'children', 'person', 'people',
  'figure', 'figures', 'crowd', 'crowds', 'onlooker', 'onlookers', 'bystander', 'bystanders',
  'villager', 'villagers', 'worker', 'workers', 'labourer', 'laborer', 'labourers', 'laborers',
  'soldier', 'soldiers', 'officer', 'officers', 'constable', 'constables', 'guard', 'guards',
  'priest', 'priests', 'merchant', 'merchants', 'farmer', 'farmers', 'servant', 'servants',
  'mother', 'father', 'elder', 'elders', 'family', 'couple', 'stranger', 'strangers',
  'doctor', 'doctors', 'nurse', 'nurses', 'teacher', 'scholar', 'scientist', 'engineer',
  'passenger', 'passengers', 'traveller', 'traveler', 'travellers', 'travelers',
  'mourner', 'mourners', 'beggar', 'beggars', 'shopkeeper', 'sailor', 'sailors',
];

const PLURAL_NOUNS = new Set(
  PERSON_NOUNS.filter((n) => n.endsWith('s') || ['men', 'women', 'children', 'people', 'crowd', 'family', 'couple'].includes(n)),
);

/** Already-masked wording — anywhere near a person, nothing needs adding. */
const MASK_MARKER = /(mannequin|porcelain|faceless|featureless|egg-smooth|blank head)/i;

/** Facial description that must never reach the image model for this style. */
const FACE_WORDS: Array<[RegExp, string]> = [
  [/\b(heavily |thickly |neatly )?(bearded|clean-shaven|moustached|mustachioed|bewhiskered|stubbled)\b\s*/gi, ''],
  [/\b(a|the)\s+(thick|full|bushy|greying|grey|gray|dark|white)?\s*(beard|moustache|mustache|stubble|sideburns)\b/gi, ''],
  [/\b(piercing|narrowed|wide|weary|tired|kind|cold|steely|hollow|sunken)\s+(eyes|gaze|stare)\b/gi, 'posture'],
  [/\b(his|her|their|its)\s+(eyes|gaze|stare|face|features|expression|mouth|lips|nose|jaw|jawline|cheeks|cheekbones|brow|brows|eyebrows)\b/gi, 'their posture'],
  [/\b(eyes|gaze|stare|facial expression|expression|smile|smiling|frown|frowning|grimace|grimacing|scowl|scowling|tears streaming)\b/gi, 'bearing'],
  [/\b(wrinkled|weathered|lined|gaunt|ruddy|pale|freckled|tanned)\s+(face|skin|complexion)\b/gi, 'worn clothing'],
  [/\b(face|faces)\s+(lit|illuminated|catching the light)\b/gi, 'blank porcelain head $2'],
];

const GUARANTEE =
  'Every figure in frame — foreground, midground and background alike — is a faceless white porcelain mannequin with a blank, egg-smooth glossy head: no eyes, no nose, no mouth, no beard, no expression, and no human skin anywhere.';

/** Matches the sentence above however it was punctuated, so it can be re-applied cleanly. */
const GUARANTEE_RE = /\s*Every figure in frame[\s\S]*?human skin anywhere\.?/i;

function maskPhrase(noun: string): string {
  return PLURAL_NOUNS.has(noun.toLowerCase())
    ? ' with blank egg-smooth porcelain mannequin heads'
    : ' with a blank egg-smooth porcelain mannequin head';
}

/**
 * Rewrites an image prompt so no human face can be rendered. Safe to run more than once:
 * a person who already carries the mannequin wording is left alone.
 */
export function enforceFacelessFigures(prompt: string): string {
  if (!prompt || typeof prompt !== 'string') return prompt;

  // Take our own closing sentence off first. It names the very features the rules below
  // strip ("no eyes, no mouth"), so leaving it in place mangled it on a second pass.
  let text = prompt.replace(GUARANTEE_RE, '');

  for (const [pattern, replacement] of FACE_WORDS) {
    text = text.replace(pattern, replacement);
  }

  const nounPattern = new RegExp(`\\b(${PERSON_NOUNS.join('|')})\\b`, 'gi');
  // Walk matches back-to-front so earlier insertions do not shift later indexes.
  const matches = [...text.matchAll(nounPattern)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const at = match.index ?? 0;
    // A window either side: the mask may be described before or after the person.
    const window = text.slice(Math.max(0, at - 90), Math.min(text.length, at + 90));
    if (MASK_MARKER.test(window)) continue;
    const end = at + match[0].length;
    text = text.slice(0, end) + maskPhrase(match[0]) + text.slice(end);
  }

  text = text.replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').trim();

  return `${text.replace(/[.\s]+$/, '')}. ${GUARANTEE}`;
}

/** True when this style must never show a human face. */
export function styleRequiresFacelessFigures(styleId: string | null | undefined): boolean {
  return styleId === 'faceless_mannequin';
}
