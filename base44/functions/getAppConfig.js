import { createClientFromRequest } from "https://cdn.base44.com/base44-deno-sdk.js";

Deno.serve(async (req) => {
  createClientFromRequest(req); // auth check

  return Response.json({
    cloudinary_cloud_name: Deno.env.get('openshorts_cloud_name')   || '',
    cloudinary_preset:     Deno.env.get('openshorts_cloud_preset') || 'openshorts_clips',
    assemblyai_key:        Deno.env.get('ASSEMBLYAI_API_KEY')      || '',
    cobalt_url:            Deno.env.get('COBALT_API_URL')          || 'https://api.cobalt.tools',
  });
});
