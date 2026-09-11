import { describe, expect, it, vi } from 'vitest';

import { handleDb } from '../src/routes/db';
import type { Ctx } from '../src/types';

function ctxWith(api: Record<string, any>): Ctx {
  return { db: { Projects: api } } as unknown as Ctx;
}

describe('entity route operations', () => {
  it('no longer exposes the cutover-only import op', async () => {
    const importRows = vi.fn();
    await expect(handleDb('Projects', 'import', { rows: [{ id: 'x' }] }, ctxWith({ importRows })))
      .rejects.toMatchObject({ status: 404, message: 'Unknown operation: import' });
    expect(importRows).not.toHaveBeenCalled();
  });

  it('still routes the seven public ops', async () => {
    const api = {
      filter: vi.fn(async () => []),
      list: vi.fn(async () => []),
      get: vi.fn(async () => ({ id: 'a' })),
      create: vi.fn(async (d: any) => ({ id: 'b', ...d })),
      bulkCreate: vi.fn(async () => []),
      update: vi.fn(async () => ({ id: 'a' })),
      delete: vi.fn(async () => ({ deleted: true })),
    };
    const ctx = ctxWith(api);
    expect(await handleDb('Projects', 'filter', { where: {} }, ctx)).toEqual([]);
    expect(await handleDb('Projects', 'list', {}, ctx)).toEqual([]);
    expect(await handleDb('Projects', 'get', { id: 'a' }, ctx)).toEqual({ id: 'a' });
    expect(await handleDb('Projects', 'create', { values: { name: 'n' } }, ctx)).toMatchObject({ id: 'b' });
    expect(await handleDb('Projects', 'bulkCreate', { values: [] }, ctx)).toEqual([]);
    expect(await handleDb('Projects', 'update', { id: 'a', values: {} }, ctx)).toEqual({ id: 'a' });
    expect(await handleDb('Projects', 'delete', { id: 'a' }, ctx)).toEqual({ deleted: true });
  });
});
