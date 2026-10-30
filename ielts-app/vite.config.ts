import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The frontend talks to the Express backend only through the `/api` prefix.
// In dev, Vite proxies `/api` to the Express server so the browser never needs
// to know the backend port (and the LLM key stays server-side).
const BACKEND_PORT = process.env.PORT || 8787;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      "/api": {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
