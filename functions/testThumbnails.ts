import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    
    const { project_id } = await req.json();
    
    const projects = await base44.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    
    return Response.json({ 
      success: true, 
      project_name: project?.name || 'not found',
      project_id 
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});