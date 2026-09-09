// YouTube Data API adapter. Read-only operations only: the upload/publish integration
// was intentionally removed in Phase 0. Ported functions keep their own response
// parsing, so the raw helper returns an untouched Response.

import type { Ctx } from '../types';

const YOUTUBE_DATA_API = 'https://www.googleapis.com/youtube/v3';

export async function youtubeFetch(
  ctx: Ctx,
  path: string,
  params: URLSearchParams | Record<string, string | number | boolean | undefined>,
  init: RequestInit = {},
): Promise<Response> {
  const query = params instanceof URLSearchParams
    ? new URLSearchParams(params)
    : new URLSearchParams(
        Object.entries(params)
          .filter((entry): entry is [string, string | number | boolean] => entry[1] != null)
          .map(([key, value]) => [key, String(value)]),
      );
  query.set('key', await ctx.keys.require('YOUTUBE_API_KEY'));
  const endpoint = path.replace(/^\/+/, '');
  return fetch(`${YOUTUBE_DATA_API}/${endpoint}?${query}`, { ...init, method: init.method || 'GET' });
}

export const searchYouTube = (
  ctx: Ctx,
  params: URLSearchParams | Record<string, string | number | boolean | undefined>,
) => youtubeFetch(ctx, 'search', params);
