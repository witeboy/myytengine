// Visual styles — one definition, used by every engine and by the web picker.
//
// WHY THIS EXISTS
// ---------------
// The style map used to be copy-pasted into generateScenePrompts, enhanceScenePrompts and
// rephraseScenePrompt. They drifted: two styles existed in only one of the three, so
// enhancing or rephrasing a prompt in those styles silently fell back to the default and
// the look changed mid-project. The picker was a fourth, separate list, which is how a
// style with no engine entry at all (broll_only) shipped as a card that did nothing.
//
// The catalogue lives in shared/visual-styles.json so the web picker imports the SAME file.
//
// `avoid` is not a provider negative prompt: none of the image models we call accept one.
// It is handed to the model that WRITES the prompts, so those elements never get written.

import catalogue from '../../../../shared/visual-styles.json';

export interface VisualStyle {
  id: string;
  label: string;
  desc: string;
  emoji?: string;
  pickable: boolean;
  /** 'broll' = stock footage instead of AI images; 'mode' = set by project mode, never offered. */
  kind?: 'broll' | 'mode';
  positive?: string;
  avoid?: string;
}

export const STYLES: VisualStyle[] = catalogue.styles as VisualStyle[];
export const DEFAULT_STYLE_ID: string = catalogue.default;
export const STYLE_ALIASES: Record<string, string> = catalogue.aliases;

const BY_ID = new Map(STYLES.map((s) => [s.id, s]));

/** "Skeleton Protagonist" / "photorealistic_4k" / "" -> a style id that exists. */
export function resolveStyleId(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return DEFAULT_STYLE_ID;
  const key = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (BY_ID.has(key)) return key;
  const alias = STYLE_ALIASES[key];
  if (alias && BY_ID.has(alias)) return alias;
  // Last resort for free-typed values: the longest alias or id contained in the text, so
  // "dark faceless mannequin history" still lands on faceless_mannequin. Longest first, or
  // "anime" would win over "cinematic_anime".
  const candidates = [...BY_ID.keys(), ...Object.keys(STYLE_ALIASES)].sort((a, b) => b.length - a.length);
  for (const candidate of candidates) {
    if (key.includes(candidate)) return BY_ID.has(candidate) ? candidate : STYLE_ALIASES[candidate];
  }
  return DEFAULT_STYLE_ID;
}

export function getStyle(raw: unknown): VisualStyle {
  return BY_ID.get(resolveStyleId(raw)) as VisualStyle;
}

/** Scenes use stock footage instead of generated images. */
export function isBrollOnlyStyle(raw: unknown): boolean {
  return getStyle(raw).kind === 'broll';
}

/**
 * The shape the prompt engines expect: { [id]: { positive, negative } }. `negative` is kept
 * as the name the engines already use for the avoid list.
 */
export function styleMapForEngines(): Record<string, { positive: string; negative: string }> {
  const map: Record<string, { positive: string; negative: string }> = {};
  for (const style of STYLES) {
    if (!style.positive) continue;
    map[style.id] = { positive: style.positive, negative: style.avoid || '' };
  }
  return map;
}
