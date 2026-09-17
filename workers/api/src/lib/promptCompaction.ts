// Fitting a cinematic prompt into a short-prompt model.
//
// Our scene prompts run to several hundred words: subject and action first, then
// environment, then the style suffix — lighting, palette, lens, film stock — at the end.
// Z-Image accepts roughly a thousand characters. Cutting at the limit therefore threw
// away precisely the part that makes the picture look like the rest of the film, which is
// why its images came back flat and off-style.
//
// Instead of truncating, this keeps both ends: the opening sentences that say what the
// shot IS, and the style tail that says what it LOOKS like, dropping the middle
// elaboration that a short-prompt model ignores anyway.

/** Words that mark a sentence as describing the look rather than the subject. */
const STYLE_MARKERS = /\b(lighting|lit|light|shadow|palette|colou?r|grade|graded|lens|anamorphic|bokeh|depth of field|f\/\d|film stock|grain|35mm|65mm|imax|chiaroscuro|tones?|contrast|mood|atmosphere|rendered|render|photograph|painting|illustration|cel[- ]shaded|masterpiece)\b/i;

function sentencesOf(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text])
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Keeps the subject at the front and the look at the back, within `limit` characters.
 * Never returns a fragment cut mid-sentence unless a single sentence is itself too long.
 */
export function compactPrompt(prompt: string, limit = 950): string {
  const text = (prompt || '').trim();
  if (!text) return '';
  if (text.length <= limit) return text;

  const sentences = sentencesOf(text);
  if (sentences.length <= 1) {
    // One enormous sentence: trim on a word boundary rather than mid-word.
    const cut = text.slice(0, limit);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
  }

  // The look: the last sentences that describe style, kept whole, newest first.
  const styleTail: string[] = [];
  let tailChars = 0;
  const tailBudget = Math.min(Math.floor(limit * 0.45), 420);
  for (let i = sentences.length - 1; i >= 1 && tailChars < tailBudget; i--) {
    const sentence = sentences[i];
    if (!STYLE_MARKERS.test(sentence)) continue;
    if (tailChars + sentence.length + 1 > tailBudget) continue;
    styleTail.unshift(sentence);
    tailChars += sentence.length + 1;
  }

  // The subject: sentences from the start, until what is left would not fit the tail.
  const head: string[] = [];
  let headChars = 0;
  const headBudget = limit - tailChars - 1;
  for (const sentence of sentences) {
    if (styleTail.includes(sentence)) break;
    if (headChars + sentence.length + 1 > headBudget) break;
    head.push(sentence);
    headChars += sentence.length + 1;
  }

  // The opening sentence carries the shot itself; keep it even if it is long.
  if (!head.length) {
    const first = sentences[0].slice(0, headBudget).trim();
    head.push(first);
  }

  const out = [...head, ...styleTail].join(' ').replace(/\s{2,}/g, ' ').trim();
  return out.length <= limit ? out : out.slice(0, limit).trim();
}
