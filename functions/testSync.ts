import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  const scenes = await base44.asServiceRole.entities.Scenes.list();
  return Response.json({ ok: true, scenes: scenes.length, user: user?.email });
});