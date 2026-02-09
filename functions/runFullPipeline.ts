import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id } = body;

    const project = await base44.entities.Projects.get(project_id);

    const results = {};

    try {
      // PHASE 1: Foundation (parallel)
      const topics_result = await base44.functions.invoke('generateTopics', {
        project_id: project_id,
        niche: project.niche
      });

      const brand_result = await base44.functions.invoke('generateBrandIdentity', {
        project_id: project_id,
        niche: project.niche
      });

      results.topics = topics_result.data;
      results.brand = brand_result.data;

      // Auto-select top topic (rank 1)
      const top_topic = results.topics.topics.find(t => t.rank === 1);

      await base44.entities.Topics.update(top_topic.id, { is_selected: true });

      await base44.entities.Projects.update(project_id, { selected_topic_id: top_topic.id });

      // PHASE 2: Scripting (sequential)
      const hooks_result = await base44.functions.invoke('generateHooks', {
        project_id: project_id,
        topic_id: top_topic.id,
        topic_title: top_topic.title
      });

      results.hooks = hooks_result.data;

      const top_hook = results.hooks.hooks.find(h => h.rank === 1);

      await base44.entities.Hooks.update(top_hook.id, { is_selected: true });

      const script_result = await base44.functions.invoke('generateScript', {
        project_id: project_id,
        topic_id: top_topic.id,
        topic_title: top_topic.title,
        topic_description: top_topic.description,
        selected_hook: top_hook.hook_text
      });

      results.script = script_result.data;

      const edited_result = await base44.functions.invoke('editScript', {
        project_id: project_id,
        script_id: results.script.script.id,
        topic_title: top_topic.title,
        full_script: results.script.script.full_script
      });

      results.edited = edited_result.data;

      const edited_id = results.edited.edited_script.id;

      const retention_result = await base44.functions.invoke('generateRetentionMap', {
        project_id: project_id,
        script_id: edited_id,
        category: project.category || project.niche
      });

      results.retention = retention_result.data;

      const outro_result = await base44.functions.invoke('rewriteOutro', {
        project_id: project_id,
        script_id: edited_id
      });

      results.outro = outro_result.data;

      const final_script_id = results.outro.final_script.id;

      // PHASE 3: Production (parallel where possible)
      const voice_result = await base44.functions.invoke('generateVoiceProfile', {
        project_id: project_id,
        tone: project.tone
      });

      const visuals_result = await base44.functions.invoke('generateVisualPrompts', {
        project_id: project_id,
        script_id: final_script_id
      });

      results.voice = voice_result.data;
      results.visuals = visuals_result.data;

      const assets_result = await base44.functions.invoke('generateAssetPlan', {
        project_id: project_id
      });

      results.assets = assets_result.data;

      const timing_result = await base44.functions.invoke('generateTimingSync', {
        project_id: project_id,
        script_id: final_script_id
      });

      results.timing = timing_result.data;

      // PHASE 4: Publish
      const thumbnails_result = await base44.functions.invoke('generateThumbnails', {
        project_id: project_id,
        video_title: results.outro.final_script.title
      });

      const metadata_result = await base44.functions.invoke('generateUploadMetadata', {
        project_id: project_id
      });

      results.thumbnails = thumbnails_result.data;
      results.metadata = metadata_result.data;

      const calendar_result = await base44.functions.invoke('generateContentCalendar', {
        project_id: project_id,
        niche: project.niche,
        posts_per_week: project.posts_per_week
      });

      results.calendar = calendar_result.data;

      await base44.entities.Projects.update(project_id, { status: "publish_ready", current_step: 14 });

      return Response.json({ success: true, results: results });
    } catch (error) {
      return Response.json({ success: false, error: error.message, results: results }, { status: 500 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});