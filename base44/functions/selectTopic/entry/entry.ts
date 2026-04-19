import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
// v2 — redeployed

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id, topic_id } = body;

    const all_topics_list = await base44.entities.Topics.list();
    const all_topics = all_topics_list.filter(t => t.project_id === project_id);

    for (const t of all_topics) {
      if (t.is_selected) {
        await base44.entities.Topics.update(t.id, { is_selected: false });
      }
    }

    await base44.entities.Topics.update(topic_id, { is_selected: true });

    await base44.entities.Projects.update(project_id, { 
      selected_topic_id: topic_id,
      status: 'topic_selected',
      current_step: 1
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});