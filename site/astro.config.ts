import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import { rm } from 'node:fs/promises';
import type { AstroIntegration } from 'astro';
import { defineConfig } from 'astro/config';
import { SITE_URL } from './src/lib/site.ts';

// Só existem no dev, nunca no deploy: /design (playground) e /data (fixtures fictícias de public/data;
// em produção os dados ao vivo vêm do worker, não do build).
const soNoDev: AstroIntegration = {
  name: 'so-no-dev',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      await rm(new URL('design', dir), { recursive: true, force: true });
      await rm(new URL('design.html', dir), { force: true });
      await rm(new URL('data', dir), { recursive: true, force: true });
    },
  },
};

export default defineConfig({
  output: 'static',
  site: SITE_URL,
  // /c/sao-luis-ma (sem barra final): é a URL canônica do brief e a que o Cloudflare Pages serve para sao-luis-ma.html.
  trailingSlash: 'never',
  build: { format: 'file' },
  // Builds isolados e prints de trabalho têm milhares de arquivos: vigiá-los derruba o dev server (EMFILE).
  vite: { server: { watch: { ignored: ['**/.builds/**', '**/.shots/**'] } } },
  integrations: [preact(), sitemap({ filter: (pagina) => !new URL(pagina).pathname.startsWith('/design') }), soNoDev],
});
