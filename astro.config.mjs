// @ts-check
import { defineConfig, envField } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  env: {
    schema: {
      // Web3Forms access key. It is a PUBLIC key (it ends up in the built
      // HTML), but reading it from an env var keeps it out of the git repo.
      // Set this as the WEB3FORMS_KEY variable in Railway.
      WEB3FORMS_KEY: envField.string({ context: 'client', access: 'public', optional: true, default: '' }),
    },
  },
  vite: {
    plugins: [tailwindcss()]
  }
});