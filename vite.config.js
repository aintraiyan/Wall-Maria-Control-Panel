
import { defineConfig } from "vite";

export default defineConfig({
  base: "/https://github.com/aintraiyan/Wall-Maria-Control-Panel.git/",

  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },

  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
