import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import schema from '../src/db/schema.sql?raw';
import { makeDb, type Db } from '../src/db/client';
import { coldKey } from '../src/db/cold';
import type { Env as WorkerEnv, User } from '../src/types';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}

const user: User = {
  id: 'phase2-parity',
  email: 'phase2-parity@myytengine.invalid',
};

type TrackedRow = { entity: string; id: string };

let db: Db;
let trackedRows: TrackedRow[] = [];

function track(entity: string, id: string): void {
  trackedRows.push({ entity, id });
}

beforeAll(async () => {
  const executableSchema = schema.replace(/\r/g, '').replace(/^\s*--.*$/gm, '');
  for (const statement of executableSchema.split(';').map((sql) => sql.trim()).filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
  db = makeDb(env, user);
});

afterEach(async () => {
  for (const { entity, id } of trackedRows.reverse()) {
    await db[entity].delete(id);
  }
  trackedRows = [];
});

describe('D1/R2 the original platform parity', () => {
  it('1. filter({}) returns [] for representative empty tables', async () => {
    for (const entity of ['Projects', 'Scenes', 'ProductionSettings', 'UploadMetadata']) {
      expect(await db[entity].filter({})).toEqual([]);
    }
  });

  it('2. create returns the full row and server-owned metadata', async () => {
    const created = await db.Projects.create({ name: 'Parity project', status: 'draft' });
    track('Projects', created.id);

    expect(created).toMatchObject({
      id: expect.any(String),
      name: 'Parity project',
      status: 'draft',
      created_by: user.email,
      created_date: expect.any(String),
      updated_date: expect.any(String),
    });
    expect(created.id).not.toHaveLength(0);
  });

  it('3. update is a partial merge that leaves declared fields intact', async () => {
    const created = await db.Scenes.create({
      project_id: 'phase2-partial',
      scene_number: 7,
      narration_text: 'Do not replace me',
      status: 'queued',
    });
    track('Scenes', created.id);

    const updated = await db.Scenes.update(created.id, { status: 'complete' });

    expect(updated).toMatchObject({
      project_id: 'phase2-partial',
      scene_number: 7,
      narration_text: 'Do not replace me',
      status: 'complete',
    });
  });

  it('4. undeclared fields round-trip through attrs', async () => {
    const created = await db.Projects.create({
      name: 'Attrs project',
      totally_new: 'x',
    });
    track('Projects', created.id);

    expect(created.totally_new).toBe('x');
    expect((await db.Projects.get(created.id))?.totally_new).toBe('x');
  });

  it('5. partial update preserves previously written undeclared fields', async () => {
    const created = await db.Projects.create({
      name: 'Attrs merge before',
      totally_new: 'x',
    });
    track('Projects', created.id);

    const updated = await db.Projects.update(created.id, { name: 'Attrs merge after' });

    expect(updated.name).toBe('Attrs merge after');
    expect(updated.totally_new).toBe('x');
  });

  it('6. oversized cold fields round-trip byte-identically and delete purges R2', async () => {
    const timeline = JSON.stringify(
      Array.from({ length: 1800 }, (_, index) => ({
        index,
        url: `https://media.example/clip-${index}.mp4`,
      })),
    );
    expect(new TextEncoder().encode(timeline).byteLength).toBeGreaterThan(65_536);

    const created = await db.ProductionSettings.create({
      project_id: 'phase2-cold',
      timeline_video_clips: timeline,
    });
    track('ProductionSettings', created.id);

    expect(created.timeline_video_clips).toBe(timeline);
    expect(new TextEncoder().encode(created.timeline_video_clips)).toEqual(
      new TextEncoder().encode(timeline),
    );

    const raw = await env.DB.prepare(
      'SELECT timeline_video_clips FROM ProductionSettings WHERE id = ?',
    )
      .bind(created.id)
      .first<{ timeline_video_clips: string }>();
    const sentinel = JSON.parse(raw?.timeline_video_clips || '{}') as {
      __r2?: string;
      bytes?: number;
    };
    const key = coldKey('ProductionSettings', created.id, 'timeline_video_clips');

    expect(sentinel.__r2).toBe(key);
    expect(await (await env.COLD.get(key))?.text()).toBe(timeline);

    await db.ProductionSettings.delete(created.id);

    expect(await env.COLD.get(key)).toBeNull();
  });

  it('7. list and filter honor descending and ascending sort order', async () => {
    const suffix = crypto.randomUUID().replace(/-/g, '');
    const projects = [
      { id: `${suffix}a`, created_date: '2026-01-01T00:00:00.000Z', name: 'oldest' },
      { id: `${suffix}b`, created_date: '2026-02-01T00:00:00.000Z', name: 'middle' },
      { id: `${suffix}c`, created_date: '2026-03-01T00:00:00.000Z', name: 'newest' },
    ];
    await db.Projects.importRows(projects);
    for (const project of projects) track('Projects', project.id);

    expect((await db.Projects.list('-created_date', 500)).map((row) => row.name)).toEqual([
      'newest',
      'middle',
      'oldest',
    ]);

    const projectId = `phase2-scenes-${suffix}`;
    for (const sceneNumber of [3, 1, 2]) {
      const scene = await db.Scenes.create({ project_id: projectId, scene_number: sceneNumber });
      track('Scenes', scene.id);
    }

    expect(
      (await db.Scenes.filter({ project_id: projectId }, 'scene_number')).map(
        (row) => row.scene_number,
      ),
    ).toEqual([1, 2, 3]);
  });

  it('8. UploadMetadata record_type is a promoted, filterable column', async () => {
    const scheduled = await db.UploadMetadata.create({
      project_id: 'phase2-upload-scheduled',
      record_type: 'scheduled_post',
    });
    const draft = await db.UploadMetadata.create({
      project_id: 'phase2-upload-draft',
      record_type: 'draft',
    });
    track('UploadMetadata', scheduled.id);
    track('UploadMetadata', draft.id);

    const columns = await env.DB.prepare('PRAGMA table_info(UploadMetadata)').all<{
      name: string;
    }>();
    expect(columns.results.map((column) => column.name)).toContain('record_type');

    const matches = await db.UploadMetadata.filter({ record_type: 'scheduled_post' });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      id: scheduled.id,
      record_type: 'scheduled_post',
    });
  });

  it('9. booleans, arrays, and objects retain their JSON types', async () => {
    const values = {
      name: 'Typed attrs project',
      archived: true,
      test_array: ['alpha', 2, false],
      test_object: { nested: { ok: true }, count: 3 },
    };
    const created = await db.Projects.create(values);
    track('Projects', created.id);

    const readBack = await db.Projects.get(created.id);

    expect(readBack?.archived).toBe(true);
    expect(typeof readBack?.archived).toBe('boolean');
    expect(readBack?.test_array).toEqual(values.test_array);
    expect(Array.isArray(readBack?.test_array)).toBe(true);
    expect(readBack?.test_object).toEqual(values.test_object);
    expect(typeof readBack?.test_object).toBe('object');
  });
});
