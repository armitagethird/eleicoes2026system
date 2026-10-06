import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import { rm } from 'node:fs/promises';
import type { AstroIntegration } from 'astro';
import { defineConfig } from 'astro/config';
import { SITE_URL } from './src/lib/site.ts';

// /design é o playground do card e do mapa: existe no dev, nunca no deploy.
const semPlayground: AstroIntegration = {
  name: 'sem-playground',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      await rm(new URL('design', dir), { recursive: true, force: true });
      await rm(new URL('design.html', dir), { force: true });
    },
  },
};

export default defineConfig({
  output: 'static',
  site: SITE_URL,
  // /c/sao-luis-ma (sem barra final): é a URL canônica do brief e a que o Cloudflare Pages serve para sao-luis-ma.html.
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [preact(), sitemap({ filter: (pagina) => !new URL(pagina).pathname.startsWith('/design') }), semPlayground],
});
