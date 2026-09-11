import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
  },
  // Allow serving WASM / ONNX Web assets correctly
  optimizeDeps: {
    exclude: ['@huggingface/transformers']
  }
});
