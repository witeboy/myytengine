// Character gender resolution for scene prompts.
//
// WHY THIS FILE EXISTS
// --------------------
// Image models render "a person" inconsistently — the same character comes back a
// different human in every shot. So the prompt engine rewrites vague wording into
// something concrete before it reaches the model. That part is sound.
//
// What was not sound: `rephraseScenePrompt` did it by hardcoding EVERY character to
// female —
//
//     .replace(/\bany gender\b/gi, 'female')
//     .replace(/\ba person\b/gi,   'a woman')
//
// while `enhanceScenePrompts` derived it per character. Same project, two entry points,
// two different results, and a male character described by the director came out female
// through the SceneCard "rephrase" button.
//
// THE RULE NOW: the script decides. Gender comes from what the director actually wrote
// about that character. When the director said nothing, nothing is substituted — the
// neutral wording is left exactly as written rather than defaulting to a guess.
// `enhanceScenePrompts` defaulted to female whenever no male marker was found; that is
// still a hardcoded default, just a quieter one, and it is gone too.

export type Gender = 'male' | 'female' | 'unspecified';

// Read against the character's own identity text — the director's description, casting
// sheet, or character DNA. Word-boundary matched so "hexagon" cannot match "he".
const MALE = /\b(male|man|men|boy|boys|he|him|his|himself|father|dad|husband|grandfather|grandpa|son|brother|uncle|nephew|sir|mr|gentleman|guy|lad|king|prince|actor|waiter|widower)\b/i;
const FEMALE = /\b(female|woman|women|girl|girls|she|her|hers|herself|mother|mum|mom|wife|grandmother|grandma|daughter|sister|aunt|niece|ma'?am|mrs|ms|lady|gal|queen|princess|actress|waitress|widow)\b/i;

/**
 * Decide a character's gender from what the director wrote.
 *
 * Returns 'unspecified' when the text says nothing either way, or contradicts itself —
 * a deliberate refusal to guess. Callers must leave the prompt untouched in that case.
 */
export function deriveGender(identityText: string | null | undefined): Gender {
  if (!identityText) return 'unspecified';
  const t = String(identityText);

  const male = MALE.test(t);
  const female = FEMALE.test(t);

  // Both present (e.g. "a woman talking to her father") — the markers are ambiguous for
  // THIS character, so do not pick one.
  if (male === female) return 'unspecified';
  return male ? 'male' : 'female';
}

interface GenderWords { noun: string; adj: string }

const WORDS: Record<Exclude<Gender, 'unspecified'>, GenderWords> = {
  male: { noun: 'man', adj: 'male' },
  female: { noun: 'woman', adj: 'female' },
};

/**
 * Replace vague person-wording with the gender the director specified.
 *
 * Replacement set is unchanged from the original — same patterns, same order, so output
 * is identical for a character the director described. The ONLY behavioural change is
 * that an unspecified character is now left alone instead of being made female.
 */
export function applyGender(desc: string, gender: Gender): string {
  if (!desc) return desc;
  if (gender === 'unspecified') return desc; // the director did not say — do not invent

  const { noun, adj } = WORDS[gender];
  return desc
    .replace(/\bany gender\b/gi, adj)
    .replace(/\bindividual\b/gi, noun)
    .replace(/\bperson of any gender\b/gi, noun)
    .replace(/\bgender[- ]neutral\b/gi, adj)
    .replace(/\ba person\b/gi, `a ${noun}`)
    .replace(/\bthe person\b/gi, `the ${noun}`)
    .replace(/\ban adult\b/gi, `a ${noun}`);
}

/**
 * Drop-in replacement for the old `sanitizeGender(desc)` in both prompt functions.
 * Pass the character's identity text as the second argument — that is the whole fix.
 *
 *   // before (rephraseScenePrompt)
 *   sanitizeGender(fullDesc)
 *
 *   // after
 *   sanitizeGender(fullDesc, identityDesc)
 */
export const sanitizeGender = (desc: string, identityText?: string | null): string =>
  applyGender(desc, deriveGender(identityText));
