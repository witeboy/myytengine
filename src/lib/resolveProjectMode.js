// ═══════════════════════════════════════════════════════════════════
// resolveProjectMode — single source of truth for which pipeline a project uses.
//
// Returns ONE canonical mode: 'sleep_meditation' | 'sleep_story' |
// 'shorts' | 'long_viral' | 'explainer' | 'standard'.
//
// Used by:
//   - pages/ContentGeneration handleImport dispatcher
//   - Any UI that conditionally shows mode-specific controls (explainer arc, etc.)
//
// Rules (priority order):
//   1. Explicit project.project_mode set by the user
//   2. Channel script_mode (if attached and non-standard)
//   3. Heuristic inference from niche/name (sleep/meditation/etc.)
//   4. portrait orientation → shorts
//   5. fallback: 'standard'
//
// Also returns `inferred: true` when the mode came from a heuristic (not explicit),
// so callers can self-heal the project record.
// ═══════════════════════════════════════════════════════════════════

export const KNOWN_MODES = new Set([
  'sleep_meditation',
  'sleep_story',
  'shorts',
  'youtube_shorts',
  'long_viral',
  'explainer',
  'standard',
]);

export function resolveProjectMode(project, channel = null) {
  if (!project) return { mode: 'standard', inferred: false, source: 'none' };

  // 1. Explicit project_mode wins
  const explicit = project.project_mode;
  if (explicit === 'sleep_meditation' || explicit === 'sleep_story') {
    return { mode: explicit, inferred: false, source: 'project.project_mode' };
  }
  if (explicit === 'explainer') {
    return { mode: 'explainer', inferred: false, source: 'project.project_mode' };
  }
  if (explicit === 'long_viral') {
    return { mode: 'long_viral', inferred: false, source: 'project.project_mode' };
  }
  if (explicit === 'shorts' || explicit === 'youtube_shorts') {
    return { mode: 'shorts', inferred: false, source: 'project.project_mode' };
  }

  // 2. Channel script_mode
  const channelMode = channel?.script_mode;
  if (channelMode && channelMode !== 'standard' && KNOWN_MODES.has(channelMode)) {
    return { mode: channelMode, inferred: true, source: 'channel.script_mode' };
  }

  // 3. Heuristic from niche/name (sleep family only — explainer/long_viral must be explicit)
  const niche = (channel?.niche || project?.niche || '').toLowerCase();
  const name = (channel?.name || '').toLowerCase();
  const combined = `${niche} ${name}`;
  if (/sleep\s*stor|bedtime\s*stor/i.test(combined)) {
    return { mode: 'sleep_story', inferred: true, source: 'niche-keyword' };
  }
  if (/sleep|meditation|relax|calm|sooth|asmr|bedtime/i.test(combined)) {
    return { mode: 'sleep_meditation', inferred: true, source: 'niche-keyword' };
  }

  // 4. Portrait orientation → shorts
  if (project?.orientation === 'portrait') {
    return { mode: 'shorts', inferred: true, source: 'orientation' };
  }

  // 5. Fallback
  return { mode: 'standard', inferred: false, source: 'default' };
}

// Helpers for branch checks — use these everywhere instead of ad-hoc OR chains
export const isSleepMode      = (m) => m === 'sleep_meditation' || m === 'sleep_story';
export const isShortsMode     = (m) => m === 'shorts' || m === 'youtube_shorts';
export const isExplainerMode  = (m) => m === 'explainer';
export const isLongViralMode  = (m) => m === 'long_viral';
export const isStandardMode   = (m) => m === 'standard';

// Map a resolved mode to the ONLY scene-breakdown function allowed for it.
// This is the strict whitelist — any caller that picks a function not in this
// map for the resolved mode has a bug.
export const SCENE_BREAKDOWN_FUNCTION = {
  sleep_meditation: 'sleepSceneBreakdown',
  sleep_story:      'sleepSceneBreakdown',
  shorts:           'shortsSceneBreakdown',
  youtube_shorts:   'shortsSceneBreakdown',
  long_viral:       'longViralSceneBreakdown',
  explainer:        'explainerSceneBreakdown',
  standard:         'generateSceneBreakdown',
};

// Validation: throws if a chosen function doesn't match the resolved mode.
// Call this immediately before invoking a scene-breakdown backend function.
export function assertBreakdownMatchesMode(chosenFn, resolvedMode) {
  const expected = SCENE_BREAKDOWN_FUNCTION[resolvedMode];
  if (!expected) {
    throw new Error(`Unknown project mode "${resolvedMode}" — cannot dispatch scene breakdown.`);
  }
  if (chosenFn !== expected) {
    throw new Error(
      `Pipeline mismatch — project_mode "${resolvedMode}" requires "${expected}" but caller chose "${chosenFn}". ` +
      `This is a bug — sleep/explainer/shorts/long-viral/standard pipelines must never cross-route.`
    );
  }
}