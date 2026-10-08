import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// `anime-style` resolves to the engine folder, exactly like it would from npm
// or a copied folder in another project.
export default defineConfig({
  resolve: {
    alias: {
      'anime-style': fileURLToPath(new URL('./src/anime-style/index.js', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        minimal: fileURLToPath(new URL('./examples/minimal.html', import.meta.url)),
        model: fileURLToPath(new URL('./examples/model.html', import.meta.url)),
        loop: fileURLToPath(new URL('./examples/custom-loop.html', import.meta.url)),
      },
    },
  },
});
