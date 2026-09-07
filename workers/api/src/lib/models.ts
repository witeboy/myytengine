// Model id mapping: what the code pins -> what the aggregator actually serves.
//
// WHY THIS IS NOT OPTIONAL
// ------------------------
// The Base44 code hardcodes Google/Anthropic/OpenAI model ids from its own era. Almost
// none of them exist in CheaperInference's catalogue, and the mismatches are silent
// 404s at runtime, not build errors. Measured across the ported functions:
//
//   gemini-2.0-flash            39 uses   NOT in catalogue
//   gemini-2.5-pro               9 uses   NOT in catalogue
//   claude-sonnet-4-20250514     5 uses   NOT in catalogue
//   claude-sonnet-4-5            4 uses   catalogue spells it claude-sonnet-4.5  (dot, not dash)
//   claude-sonnet-4-6            3 uses   catalogue spells it claude-sonnet-4.6  (dot, not dash)
//   claude-sonnet-3-5            3 uses   NOT in catalogue
//   gpt-4o                       6 uses   NOT in catalogue
//   gpt-4o-mini                  3 uses   NOT in catalogue
//   gemini-2.5-flash             3 uses   present — passes through
//   gemini-3.1-pro-preview       1 use    present — passes through
//
// So the map below is load-bearing. An unmapped id passes through unchanged, which is
// correct when the names already agree and a loud 404 when they do not.
//
// ⚠ THESE ARE SUBSTITUTIONS, NOT EQUIVALENCES. Model choice changes output quality and
// cost, and the ~380KB prompt engine was tuned against gemini-2.0-flash.
//
// DECIDED — quality over cost on both, for asymmetric reasons:
//
//   gemini-2.0-flash -> gemini-2.5-flash, NOT gemini-3.1-flash-lite.
//   39 call sites, including the entire prompt engine. flash-lite is ~40% cheaper on
//   output, which is the dominant cost here (16384 maxOutputTokens, 12 scenes a batch).
//   Taken anyway: a "lite" model doing nuanced visual direction is the one place a
//   regression would be expensive and hard to attribute. Worth A/B-ing on real scene
//   prompts once there is usage data — it is a one-line change and the saving is real.
//
//   gpt-4o -> gpt-5.4, NOT gpt-5-mini.
//   gpt-5-mini is 10x cheaper, but only TWO live functions use gpt-4o
//   (generateProgressionPrompts, which is a 41KB prompt engine of its own, and
//   generateSeoDescriptions). Volume is low enough that the saving is noise, so there is
//   nothing to buy by risking Flow/Re-make output.
//
// Changing a target here changes every call site that pins that id.

export type Provider = 'gemini' | 'anthropic' | 'openai';

/**
 * Catalogue prices are list/discounted per 1M tokens, recorded here so the cost of a
 * substitution is visible at the point of decision.
 */
export const MODEL_MAP: Record<string, string> = {
  // ── Gemini ────────────────────────────────────────────────────────────────
  // The workhorse: 39 call sites, including the whole prompt engine.
  // gemini-2.5-flash  $0.30 -> $0.21 in / $2.50 -> $1.75 out
  // Cheaper alternative if quality allows: gemini-3.1-flash-lite ($0.25 / $1.49).
  'gemini-2.0-flash': 'gemini-2.5-flash',
  'gemini-2.0-flash-exp': 'gemini-2.5-flash',
  'gemini-2.5-flash': 'gemini-2.5-flash',            // present as-is
  // Reasoning tier. gemini-3.1-pro  $2.00 / $12.00
  'gemini-2.5-pro': 'gemini-3.1-pro',
  'gemini-1.5-pro': 'gemini-3.1-pro',
  'gemini-3.1-pro-preview': 'gemini-3.1-pro-preview', // present as-is

  // ── Anthropic ─────────────────────────────────────────────────────────────
  // Note the punctuation: the code uses dashes, the catalogue uses dots. Every one of
  // these would 404 unmapped.
  'claude-sonnet-4-6': 'claude-sonnet-4.6',          // $3.00 / $15.00
  'claude-sonnet-4-5': 'claude-sonnet-4.5',          // $3.00 / $15.00
  'claude-sonnet-4-20250514': 'claude-sonnet-4.5',
  // 3.5 Sonnet was the fast mid tier. claude-haiku-4.5 ($1.00 / $5.00) is the closer
  // cost match; claude-sonnet-4.5 is the closer quality match. Quality chosen — flip it
  // if this path turns out to be high-volume.
  'claude-sonnet-3-5': 'claude-sonnet-4.5',

  // ── OpenAI ────────────────────────────────────────────────────────────────
  // gpt-4o was mid tier. gpt-5.4 ($2.50 / $15.00) is the quality-equivalent successor;
  // gpt-5-mini ($0.25 / $2.00) is 10x cheaper if these calls tolerate it.
  // Used by: generateProgressionPrompts, generateSeoDescriptions, overlay copy.
  'gpt-4o': 'gpt-5.4',
  'gpt-4o-mini': 'gpt-5-mini',                       // $0.25 / $2.00
};

/** Unmapped ids pass through — correct when names already agree. */
export const mapModel = (id: string): string => MODEL_MAP[id] || id;

/**
 * Rewrite the `model` field of an outgoing request body. Used by anthropicFetch and
 * openaiFetch, where the model travels in the body rather than the URL — which is why
 * those calls are a base-URL swap PLUS this, not a base-URL swap alone.
 */
export function remapBodyModel(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const b = body as Record<string, unknown>;
  if (typeof b.model !== 'string') return body;
  const mapped = mapModel(b.model);
  return mapped === b.model ? body : { ...b, model: mapped };
}

/** Same, for a serialized JSON body. Returns the original string if it is not JSON. */
export function remapSerializedModel(body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (typeof body !== 'string') return body;
  try {
    const parsed = JSON.parse(body);
    const remapped = remapBodyModel(parsed);
    return remapped === parsed ? body : JSON.stringify(remapped);
  } catch {
    return body;
  }
}

/**
 * Ids the code pins that are known NOT to exist upstream. Used by a startup check so a
 * missing mapping surfaces once, loudly, instead of as a scattering of 404s.
 */
export const KNOWN_MISSING_UPSTREAM = [
  'gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-2.5-pro', 'gemini-1.5-pro',
  'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-sonnet-4-20250514', 'claude-sonnet-3-5',
  'gpt-4o', 'gpt-4o-mini',
];

/** True when every id the code pins has a mapping. Surfaced by healthCheck. */
export function unmappedModels(): string[] {
  return KNOWN_MISSING_UPSTREAM.filter((id) => !MODEL_MAP[id]);
}
