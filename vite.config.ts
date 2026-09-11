import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
  },
  worker: {
    format: 'es',
  },
  // Allow serving WASM / ONNX Web assets correctly
  optimizeDeps: {
    exclude: ['@huggingface/transformers']
  }
});

