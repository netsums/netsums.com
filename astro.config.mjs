// @ts-check
import { defineConfig, envField } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  // The site is static by default; only pages that opt out with
  // `export const prerender = false` (currently just the homepage, so it can
  // fetch the latest YouTube videos on each request) are server-rendered.
  adapter: node({ mode: 'standalone' }),
  env: {
    schema: {
      // Web3Forms access key. It is a PUBLIC key (it ends up in the built
      // HTML), but reading it from an env var keeps it out of the git repo.
      // Set this as the WEB3FORMS_KEY variable in Railway.
      WEB3FORMS_KEY: envField.string({ context: 'client', access: 'public', optional: true, default: '' }),
      // YouTube Data API v3 key, used server-side to fetch the latest uploads.
      // Set this as the YOUTUBE_API_KEY variable in Railway. When unset the
      // homepage falls back to a bundled snapshot of the latest videos.
      YOUTUBE_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true, default: '' }),
    },
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
