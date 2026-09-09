// Stock-video provider adapters. These deliberately return raw Responses: the three
// b-roll functions have distinct filtering and normalization rules that must survive
// their later ports unchanged.

import type { Ctx } from '../types';

export async function pexelsFetch(
  ctx: Ctx,
  params: URLSearchParams | Record<string, string | number | boolean | undefined>,
): Promise<Response> {
  const query = toSearchParams(params);
  return fetch(`https://api.pexels.com/videos/search?${query}`, {
    headers: { Authorization: await ctx.keys.require('PEXELS_API_KEY') },
  });
}

export async function pixabayFetch(
  ctx: Ctx,
  params: URLSearchParams | Record<string, string | number | boolean | undefined>,
): Promise<Response> {
  const query = toSearchParams(params);
  query.set('key', await ctx.keys.require('PIXABAY_API_KEY'));
  return fetch(`https://pixabay.com/api/videos/?${query}`);
}

function toSearchParams(
  params: URLSearchParams | Record<string, string | number | boolean | undefined>,
): URLSearchParams {
  if (params instanceof URLSearchParams) return new URLSearchParams(params);
  return new URLSearchParams(
    Object.entries(params)
      .filter((entry): entry is [string, string | number | boolean] => entry[1] != null)
      .map(([key, value]) => [key, String(value)]),
  );
}
