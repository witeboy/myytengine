/**
 * Generates a safe, consistent filename base from project title and niche.
 * Format: "{title}-{niche}" with non-alphanumeric chars replaced by underscores.
 * 
 * @param {string} title - The content/project title
 * @param {string} niche - The content niche
 * @returns {string} Safe filename base (no extension)
 */
export function makeFileBase(title, niche) {
  const t = (title || 'untitled').trim();
  const n = (niche || '').trim();
  const raw = n ? `${t}-${n}` : t;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').substring(0, 120);
}