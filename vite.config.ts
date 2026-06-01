import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose on LAN so the shop's phone/tablet can open it during dev
    proxy: {
      // Forward API calls to the Fastify backend during development.
      '/api': 'http://localhost:3000',
    },
  },
});
