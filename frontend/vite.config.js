import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // CEO chat → dev_sim agents (optional bridge)
      '/api/orchestrate': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
      },
      '/api/health': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
      },
      // Personas for the two agents (FastAPI — same process as economy, ``python run_api.py``)
      '/api/agents': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      // Economy / tycoon ledger (FastAPI — python run_api.py)
      '/api/simulate': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/company': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      '/api/orchestrate': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
      },
      '/api/health': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
      },
      '/api/agents': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/simulate': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/company': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
