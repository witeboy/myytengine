import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import checkMusicStatus from '../src/fn/checkMusicStatus';
import generateMusic from '../src/fn/generateMusic';
import generateVoiceover from '../src/fn/generateVoiceover';
import quickPublishTranscribe from '../src/fn/quickPublishTranscribe';
import { FUNCTIONS } from '../src/fn/registry';
import type { Ctx, Env, User } from '../src/types';

const user: User = { id: 'phase8', email: 'phase8@myytengine.invalid' };

function makeCtx(options: {
  keys?: Record<string, string>;
  db?: Record<string, any>;
} = {}): Ctx {
  const configured = options.keys || {};
  return {
    env: {
      MEDIA: env.MEDIA,
      COLD: env.COLD,
      AI: { run: vi.fn() },
      MEDIA_BACKEND: 'r2',
      MEDIA_PUBLIC_BASE: 'https://media.example.test',
    } as unknown as Env,
    user,
    db: (options.db || {}) as Ctx['db'],
    keys: {
      get: async (provider: string) => configured[provider] || null,
      require: async (provider: string) => {
        const value = configured[provider];
        if (!value) throw new Error(`Missing test key: ${provider}`);
        return value;
      },
      has: async (provider: string) => Boolean(configured[provider]),
      settings: async () => ({ asr_provider: 'auto' }),
    } as Ctx['keys'],
    waitUntil: () => {},
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Phase 8 audio contracts', () => {
  it('registers all 13 Phase 8 functions under their canonical names', () => {
    const names = [
      'generateVoiceover', 'pollVoiceover', 'listVoices', 'listVoicesByProvider',
      'previewVoice', 'inworldVoiceover', 'generateMusic', 'checkMusicStatus',
      'submitTranscription', 'pollTranscription', 'clipAndVoice',
      'quickPublishTranscribe', 'generateSoundEffect',
    ];
    for (const name of names) expect(FUNCTIONS[name]).toBeTypeOf('function');
  });

  it('keeps the actionable MiniMax missing-key error', async () => {
    const ctx = makeCtx({
      db: {
        Projects: { filter: vi.fn(async () => [{ id: 'project-1', project_mode: 'standard' }]) },
        Scripts: { filter: vi.fn(async () => [{ version: 'final_aggregated', full_script: 'A short script.' }]) },
        ProductionSettings: { filter: vi.fn(async () => []) },
      },
    });

    await expect(generateVoiceover({
      project_id: 'project-1',
      provider: 'minimax_direct',
      voice_id: 'English_expressive_narrator',
    }, ctx)).rejects.toMatchObject({
      status: 500,
      message: 'MINIMAX_API_KEY not configured. Switch to AI33.',
    });
  });

  it('submits instrumental music through AI33 and preserves the frontend response shape', async () => {
    let requestUrl = '';
    let requestBody: any;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      requestUrl = url;
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ success: true, task_id: 'music-task-1' });
    }));
    const update = vi.fn(async () => ({}));
    const ctx = makeCtx({
      keys: { AI33_API_KEY: 'test-key' },
      db: { MusicTracks: { update } },
    });

    await expect(generateMusic({
      track_id: 'track-1',
      prompt: 'Tense cinematic strings',
      genre: 'Cinematic',
      mood: 'Tense',
    }, ctx)).resolves.toMatchObject({
      success: true,
      status: 'pending',
      task_id: 'music-task-1',
      music_prompt: 'Tense cinematic strings',
    });
    expect(requestUrl).toContain('/v1s/task/music-generation');
    expect(requestBody).toMatchObject({ create_mode: 'simple', make_instrumental: true });
    expect(update).toHaveBeenCalledWith('track-1', { status: 'generating' });
  });

  it('polls AI33 music, stores the finished audio, and returns COMPLETED for MusicPanel', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/v1/task/')) {
        return Response.json({
          status: 'done',
          progress: 100,
          metadata: {
            audio_url: 'https://provider.example.test/music.mp3',
            suno_result: { clips: [{ duration: 73.4 }] },
          },
        });
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'audio/mpeg' },
      });
    }));
    const update = vi.fn(async () => ({}));
    const ctx = makeCtx({
      keys: { AI33_API_KEY: 'test-key' },
      db: { MusicTracks: { update } },
    });

    const result: any = await checkMusicStatus({ task_id: 'music-task-1', track_id: 'track-1' }, ctx);
    expect(result).toMatchObject({ status: 'COMPLETED', duration: 73.4 });
    expect(result.audio_url).toMatch(/^https:\/\/media\.example\.test\/durable\//);
    expect(update).toHaveBeenCalledWith('track-1', expect.objectContaining({
      audio_url: result.audio_url,
      status: 'completed',
      duration_seconds: 73,
    }));

    const key = result.audio_url.replace('https://media.example.test/', '');
    await env.MEDIA.delete(key);
  });

  it('round-trips the OpenShorts manifest through R2 without exposing credentials', async () => {
    const ctx = makeCtx();
    const project = { job_id: 'phase8-project', title: 'Phase 8' };
    try {
      await expect(quickPublishTranscribe({ action: 'bunny_save_project', project }, ctx))
        .resolves.toMatchObject({ success: true, project_count: 1 });
      await expect(quickPublishTranscribe({ action: 'bunny_list_projects' }, ctx))
        .resolves.toMatchObject({ success: true, projects: [project] });
      await expect(quickPublishTranscribe({
        action: 'bunny_delete_project', job_id: project.job_id,
      }, ctx)).resolves.toMatchObject({ success: true, project_count: 0 });
      await expect(quickPublishTranscribe({ action: 'bunny_config' }, ctx))
        .rejects.toMatchObject({ status: 410 });
    } finally {
      await env.MEDIA.delete('projects/openshorts_manifest.json');
    }
  });
});
