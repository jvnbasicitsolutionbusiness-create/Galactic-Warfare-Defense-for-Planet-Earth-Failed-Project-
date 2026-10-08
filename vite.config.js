import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        auth: "auth.html",
        game: "game.html",
      },
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "world-renderer";
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/")
          )
            return "react-runtime";
        },
      },
    },
  },
});
