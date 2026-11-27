import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static output. The site is a set of pre-rendered pages plus one client island (the map).
export default defineConfig({
  site: 'https://engineering-map.mchaseallen.com',
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  server: { host: true, port: 3480 },
  devToolbar: { enabled: false },
  integrations: [sitemap({ filter: (page) => !page.endsWith('/404/') })],
});
