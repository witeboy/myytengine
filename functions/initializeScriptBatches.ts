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

    // Get project details
    const projects = await base44.asServiceRole.entities.Projects.list();
    const project = projects.find(p => p.id === project_id);

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Delete any existing batches for this project
    const allBatches = await base44.asServiceRole.entities.ScriptBatches.list();
    const existingBatches = allBatches.filter(b => b.project_id === project_id);
    
    for (const batch of existingBatches) {
      await base44.asServiceRole.entities.ScriptBatches.delete(batch.id);
    }

    // Define batches based on storytelling format
    let batches = [];

    if (project.storytelling_format === 'Big Lie') {
      batches = [
        {
          batch_number: 1,
          story_segment: 'The Hook & Setup',
          focus_area: 'Grab attention with the surprising contradiction'
        },
        {
          batch_number: 2,
          story_segment: 'The Evidence Against',
          focus_area: 'Build the case for why the "big lie" seemed true'
        },
        {
          batch_number: 3,
          story_segment: 'The Twist & Revelation',
          focus_area: 'Reveal the actual truth with emotional impact'
        },
        {
          batch_number: 4,
          story_segment: 'The Deeper Story',
          focus_area: 'Explore the real narrative and its implications'
        },
        {
          batch_number: 5,
          story_segment: 'The Payoff & Conclusion',
          focus_area: 'Leave viewers changed by this new perspective'
        }
      ];
    } else if (project.storytelling_format === 'Zero to Hero') {
      batches = [
        {
          batch_number: 1,
          story_segment: 'The Starting Point',
          focus_area: 'Establish the humble beginning and challenges'
        },
        {
          batch_number: 2,
          story_segment: 'The Turning Point',
          focus_area: 'The moment everything changed'
        },
        {
          batch_number: 3,
          story_segment: 'The Struggle & Growth',
          focus_area: 'Obstacles overcome and lessons learned'
        },
        {
          batch_number: 4,
          story_segment: 'The Triumph',
          focus_area: 'The pinnacle achievement or transformation'
        },
        {
          batch_number: 5,
          story_segment: 'The Legacy & Lessons',
          focus_area: 'What this teaches us and why it matters'
        }
      ];
    } else if (project.storytelling_format === 'Timeline') {
      batches = [
        {
          batch_number: 1,
          story_segment: 'The Origins',
          focus_area: 'Set the historical context and early events'
        },
        {
          batch_number: 2,
          story_segment: 'The Development',
          focus_area: 'Key events and how things evolved'
        },
        {
          batch_number: 3,
          story_segment: 'The Turning Points',
          focus_area: 'Critical moments that changed everything'
        },
        {
          batch_number: 4,
          story_segment: 'The Modern Era',
          focus_area: 'How we got to where we are now'
        },
        {
          batch_number: 5,
          story_segment: 'The Future & Impact',
          focus_area: 'Implications and what it means going forward'
        }
      ];
    } else {
      // Default structure
      batches = [
        { batch_number: 1, story_segment: 'Introduction', focus_area: 'Set the stage' },
        { batch_number: 2, story_segment: 'Context & Background', focus_area: 'Provide crucial information' },
        { batch_number: 3, story_segment: 'The Main Story', focus_area: 'Core narrative' },
        { batch_number: 4, story_segment: 'The Turning Point', focus_area: 'Climax or revelation' },
        { batch_number: 5, story_segment: 'Conclusion', focus_area: 'Wrap up and key takeaway' }
      ];
    }

    // Create batch records
    const createdBatches = [];
    for (const batchData of batches) {
      const batch = await base44.asServiceRole.entities.ScriptBatches.create({
        project_id: project_id,
        batch_number: batchData.batch_number,
        story_segment: batchData.story_segment,
        focus_area: batchData.focus_area,
        status: 'pending'
      });
      createdBatches.push(batch);
    }

    return Response.json({
      success: true,
      batches_created: createdBatches.length,
      batches: createdBatches
    });
  } catch (error) {
    console.error('Error initializing batches:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});