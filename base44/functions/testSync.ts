// v2 — redeployed
Deno.serve(async (req) => {
  return Response.json({ ok: true, message: 'test sync function works' });
});