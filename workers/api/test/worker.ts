export default {
  async fetch(): Promise<Response> {
    return new Response('Phase 2 parity worker');
  },
} satisfies ExportedHandler;
