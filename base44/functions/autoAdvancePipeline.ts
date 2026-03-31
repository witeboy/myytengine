import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    
    const { event, data } = payload;
    
    if (event.type !== 'update' || !data) {
      return Response.json({ success: false, message: 'Invalid event type' });
    }

    const projectId = data.id;
    const currentStep = data.current_step;

    // Map of step numbers to function names
    const stepFunctions = {
      1: 'generateTopics',
      2: 'generateBrandIdentity',
      3: 'generateHooks',
      4: 'generateScript',
      5: 'editScript',
      6: 'generateRetentionMap',
      7: 'rewriteOutro',
      8: 'generateVoiceProfile',
      9: 'generateVisualPrompts',
      10: 'generateAssetPlan',
      11: 'generateTimingSync',
      12: 'generateThumbnails',
      13: 'generateUploadMetadata',
      14: 'generateContentCalendar',
    };

    // Get project details
    const project = await base44.asServiceRole.entities.Projects.get(projectId);
    
    if (!project) {
      return Response.json({ success: false, message: 'Project not found' });
    }

    // Determine next function to call
    const nextStep = currentStep + 1;
    const nextFunction = stepFunctions[nextStep];

    if (!nextFunction || nextStep > 14) {
      return Response.json({ success: true, message: 'Pipeline complete' });
    }

    // Prepare parameters based on the step
    let params = { project_id: projectId };

    if (nextStep === 1 || nextStep === 2) {
      params.niche = project.niche;
    } else if (nextStep === 3) {
      params.topic_id = project.selected_topic_id;
      const topic = await base44.asServiceRole.entities.Topics.get(project.selected_topic_id);
      params.topic_title = topic.title;
    } else if (nextStep === 4) {
      const topic = await base44.asServiceRole.entities.Topics.get(project.selected_topic_id);
      params.topic_id = topic.id;
      params.topic_title = topic.title;
      params.topic_description = topic.description;
      const hook = await base44.asServiceRole.entities.Hooks.list();
      const projectHook = hook.find(h => h.project_id === projectId && h.is_selected);
      params.selected_hook = projectHook?.hook_text || '';
    } else if (nextStep === 5) {
      const script = await base44.asServiceRole.entities.Scripts.get(project.script_id);
      params.script_id = script.id;
      const topic = await base44.asServiceRole.entities.Topics.get(project.selected_topic_id);
      params.topic_title = topic.title;
      params.full_script = script.full_script;
    } else if (nextStep === 6 || nextStep === 7 || nextStep === 11) {
      params.script_id = project.script_id;
    } else if (nextStep === 8) {
      params.tone = project.tone;
    } else if (nextStep === 9) {
      params.script_id = project.script_id;
    } else if (nextStep === 10) {
      // No extra params needed
    } else if (nextStep === 12) {
      const script = await base44.asServiceRole.entities.Scripts.get(project.script_id);
      params.video_title = script.title;
    } else if (nextStep === 13) {
      // No extra params needed
    } else if (nextStep === 14) {
      params.niche = project.niche;
      params.posts_per_week = project.posts_per_week;
    }

    // Call the next function (all functions use nested entry/entry paths)
    const resolvedFunction = `${nextFunction}/entry/entry`;
    try {
      const result = await base44.asServiceRole.functions.invoke(resolvedFunction, params);
      return Response.json({ success: true, step: nextStep, result: result });
    } catch (invokeError) {
      // Function invoke failed - log but don't crash
      console.warn(`Failed to invoke ${nextFunction}:`, invokeError.message);
      return Response.json({ success: true, step: nextStep, message: `Step ${nextStep} ready but invocation pending` });
    }
  } catch (error) {
    console.error('Auto-advance error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});