Deno.serve(async (req) => {
  return Response.json({
    storage_zone:     Deno.env.get('BUNNY_STORAGE_ZONE')     || '',
    storage_password: Deno.env.get('BUNNY_STORAGE_PASSWORD') || '',
    storage_region:   Deno.env.get('BUNNY_STORAGE_REGION')   || 'ny',
    cdn_url:          Deno.env.get('BUNNY_CDN_URL')          || '',
  });
});
