import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// CLEAN SCRIPT — Deduplicates narration across all scenes
// ══════════════════════════════════════════════════════════════════
//
// Detects and removes:
//   1. Exact duplicate consecutive sentences
//   2. Near-duplicate sentences (>85% word overlap)
//   3. Repeated opening/closing phrases between batches
//   4. Double spaces, orphaned punctuation, markdown artifacts
//
// Returns cleaned narration per scene + overall stats.
// ══════════════════════════════════════════════════════════════════

function splitSentences(text) {
  // Split on sentence-ending punctuation followed by space or end
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function wordSet(sentence) {
  return new Set(
    sentence.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
}

function similarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = [...setA].filter(w => setB.has(w)).length;
  return intersection / Math.max(setA.size, setB.size);
}

function cleanNarration(fullText) {
  let sentences = splitSentences(fullText);
  const removed = [];

  // Pass 1: Remove exact consecutive duplicates
  const deduped = [sentences[0]];
  for (let i = 1; i < sentences.length; i++) {
    if (sentences[i].toLowerCase().trim() === sentences[i - 1].toLowerCase().trim()) {
      removed.push({ type: 'exact_dup', text: sentences[i] });
    } else {
      deduped.push(sentences[i]);
    }
  }
  sentences = deduped;

  // Pass 2: Remove near-duplicates (>85% word overlap with any of previous 5 sentences)
  const final = [sentences[0]];
  for (let i = 1; i < sentences.length; i++) {
    const currWords = wordSet(sentences[i]);
    let isDup = false;

    // Check against previous 5 sentences
    const lookback = Math.max(0, final.length - 5);
    for (let j = final.length - 1; j >= lookback; j--) {
      const prevWords = wordSet(final[j]);
      if (similarity(currWords, prevWords) > 0.85) {
        removed.push({ type: 'near_dup', text: sentences[i], similar_to: final[j] });
        isDup = true;
        break;
      }
    }

    if (!isDup) {
      final.push(sentences[i]);
    }
  }

  // Pass 3: Clean up artifacts
  let cleaned = final.join(' ');

  // Remove markdown artifacts
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');  // **bold**
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');       // *italic*
  cleaned = cleaned.replace(/__([^_]+)__/g, '$1');       // __underline__
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1');         // _italic_
  cleaned = cleaned.replace(/#{1,6}\s*/g, '');            // ### headers
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');       // code blocks
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');          // `inline code`
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // [links](url)

  // Clean whitespace
  cleaned = cleaned.replace(/\s{2,}/g, ' ');              // double spaces
  cleaned = cleaned.replace(/\s+([.,!?;:])/g, '$1');      // space before punctuation
  cleaned = cleaned.replace(/([.!?])\1+/g, '$1');         // repeated punctuation
  cleaned = cleaned.trim();

  return { cleaned, removed };
}


Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    // Fetch all scenes
    const scenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    const sorted = scenes.sort((a, b) => a.scene_number - b.scene_number);

    if (sorted.length === 0) {
      return Response.json({ error: 'No scenes found' }, { status: 400 });
    }

    console.log(`🧹 Cleaning script for ${sorted.length} scenes`);

    // Build full script for cross-scene dedup
    const fullScript = sorted.map(s => s.narration_text || '').join(' ');
    const originalWordCount = fullScript.split(/\s+/).filter(Boolean).length;

    // Clean the full script first (catches cross-scene duplicates)
    const { cleaned: cleanedFull, removed: fullRemoved } = cleanNarration(fullScript);
    const cleanedWordCount = cleanedFull.split(/\s+/).filter(Boolean).length;

    // Now redistribute cleaned text back to scenes
    // Strategy: split cleaned text proportionally by original scene word counts
    const originalWordCounts = sorted.map(s =>
      (s.narration_text || '').split(/\s+/).filter(Boolean).length
    );
    const totalOriginalWords = originalWordCounts.reduce((a, b) => a + b, 0);

    // Split cleaned text into words
    const cleanedWords = cleanedFull.split(/\s+/).filter(Boolean);
    let wordIndex = 0;
    let updated = 0;

    for (let i = 0; i < sorted.length; i++) {
      const scene = sorted[i];
      const proportion = totalOriginalWords > 0
        ? originalWordCounts[i] / totalOriginalWords
        : 1 / sorted.length;

      // Allocate proportional words to this scene
      let targetWords = Math.round(proportion * cleanedWords.length);

      // Ensure at least 5 words per scene, and last scene gets remainder
      if (i === sorted.length - 1) {
        targetWords = cleanedWords.length - wordIndex;
      } else {
        targetWords = Math.max(5, targetWords);
      }

      // Take words, but snap to sentence boundary
      const sceneWords = [];
      let taken = 0;
      while (wordIndex < cleanedWords.length && taken < targetWords) {
        sceneWords.push(cleanedWords[wordIndex]);
        wordIndex++;
        taken++;
      }

      // Extend to end of sentence (find next period/!/?)
      if (i < sorted.length - 1) {
        while (wordIndex < cleanedWords.length) {
          const lastWord = sceneWords[sceneWords.length - 1] || '';
          if (lastWord.endsWith('.') || lastWord.endsWith('!') || lastWord.endsWith('?')) break;
          sceneWords.push(cleanedWords[wordIndex]);
          wordIndex++;
        }
      }

      const newNarration = sceneWords.join(' ');
      const oldNarration = scene.narration_text || '';

      // Only update if changed
      if (newNarration.trim() !== oldNarration.trim()) {
        await base44.asServiceRole.entities.Scenes.update(scene.id, {
          narration_text: newNarration,
        });
        updated++;
      }
    }

    const stats = {
      original_words: originalWordCount,
      cleaned_words: cleanedWordCount,
      words_removed: originalWordCount - cleanedWordCount,
      duplicates_found: fullRemoved.length,
      exact_duplicates: fullRemoved.filter(r => r.type === 'exact_dup').length,
      near_duplicates: fullRemoved.filter(r => r.type === 'near_dup').length,
      scenes_updated: updated,
      total_scenes: sorted.length,
    };

    console.log(`✓ Script cleaned: ${stats.words_removed} words removed (${stats.duplicates_found} duplicates)`);

    return Response.json({
      success: true,
      stats,
      removed_samples: fullRemoved.slice(0, 10).map(r => ({
        type: r.type,
        text: r.text.substring(0, 80),
      })),
    });

  } catch (error) {
    console.error('cleanScript error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
