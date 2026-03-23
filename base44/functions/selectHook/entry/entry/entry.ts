import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id, hook_id } = body;

    const all_hooks_list = await base44.entities.Hooks.list();
    const all_hooks = all_hooks_list.filter(h => h.project_id === project_id);

    for (const h of all_hooks) {
      if (h.is_selected) {
        await base44.entities.Hooks.update(h.id, { is_selected: false });
      }
    }

    await base44.entities.Hooks.update(hook_id, { is_selected: true });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});