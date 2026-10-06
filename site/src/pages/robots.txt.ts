import type { APIRoute } from 'astro';

// Gerado no build para que o domínio venha só de SITE_URL (src/lib/site.ts).
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', site)}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
