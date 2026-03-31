import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    
    const { event, data } = payload;
    
    if (event.type !== 'update' || !data || data.status !== 'in_progress') {
      return Response.json({ success: false, message: 'Invalid trigger' });
    }

    const calendarEntryId = data.id;
    const calendarEntry = await base44.asServiceRole.entities.CalendarEntries.get(calendarEntryId);

    // Get the original project to inherit niche and tone
    const originalProject = await base44.asServiceRole.entities.Projects.get(calendarEntry.project_id);

    // Create new project from calendar entry
    const newProject = await base44.asServiceRole.entities.Projects.create({
      name: calendarEntry.topic_title,
      niche: originalProject.niche,
      tone: originalProject.tone,
      category: originalProject.category,
      posts_per_week: originalProject.posts_per_week,
      status: 'created',
      current_step: 0,
    });

    // Update calendar entry with link to new project
    await base44.asServiceRole.entities.CalendarEntries.update(calendarEntryId, {
      linked_project_id: newProject.id,
    });

    return Response.json({ success: true, newProjectId: newProject.id });
  } catch (error) {
    console.error('Calendar to project error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});