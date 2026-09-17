// Cleaning a script that was written for a TTS engine.
//
// Scripts often arrive with control tokens for the voice model they were drafted
// against — Higgs writes `<|prosody:long_pause|>`, others use their own. Nothing here
// understood them, so they travelled all the way through: into scene narration, into the
// image prompts, into the captions, and into the text sent to AI33's voices, which have
// never heard of them and read or stumble over them.
//
// They are removed — but not ignored. A long pause is where the writer wanted the beat
// to land, so it becomes a paragraph break and the scene splitter can use it.

/** `<|prosody:long_pause|>`, `<|pause|>`, `[pause]`, `(long pause)` and friends. */
const LONG_PAUSE = /<\|\s*(?:prosody:)?long[_\s-]?pause\s*\|>|\[\s*long[_\s-]?pause\s*\]/gi;
const SHORT_PAUSE = /<\|\s*(?:prosody:)?(?:pause|break|breath)\s*\|>|\[\s*(?:pause|break|breath)\s*\]/gi;
/** Anything else in the `<|…|>` control-token form, whatever engine wrote it. */
const ANY_CONTROL_TOKEN = /<\|[^|>]*\|>/g;

/**
 * Removes TTS control tokens. A long pause becomes a paragraph break (the writer's own
 * beat boundary); a short pause becomes a space. Safe to run on text with no tokens.
 */
export function stripTtsMarkers(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(LONG_PAUSE, '\n\n')
    .replace(SHORT_PAUSE, ' ')
    .replace(ANY_CONTROL_TOKEN, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.;:!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The canonical sentence splitter. Scene planning and the breakdown must agree on what
 * "sentence 12" means, so both import this one rather than keeping their own copy.
 */
export function splitIntoSentences(text: string): string[] {
  const raw = (text || '').match(/[^.!?…]+[.!?…]+["']?[\s]*/g) || [text || ''];
  return raw.map(s => s.trim()).filter(Boolean);
}

/** True when a script still carries control tokens — used to report, not to guess. */
export function hasTtsMarkers(text: string | null | undefined): boolean {
  return typeof text === 'string' && /<\|[^|>]*\|>/.test(text);
}
