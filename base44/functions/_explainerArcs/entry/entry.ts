// Reference-only module — not invoked. Real arc definitions are inlined
// into initializeScriptBatches and generateScriptBatches because Deno deploy
// does not allow cross-function imports.
Deno.serve(() => new Response('Reference only', { status: 200 }));