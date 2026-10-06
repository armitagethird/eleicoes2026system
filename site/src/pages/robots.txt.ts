import type { APIRoute } from 'astro';

// Gerado no build para que o domínio venha só de SITE_URL (src/lib/site.ts).
// /data e /busca.json são dados do front (milhares de JSONs sem valor de busca); o fetch da página não passa pelo robots.txt.
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\nDisallow: /data/\nDisallow: /busca.json\n\nSitemap: ${new URL('sitemap-index.xml', site)}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
