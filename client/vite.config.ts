import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [react(), wasm()],
  assetsInclude: ["**/*.wasm"], // ✅ Ensure Vite recognizes .wasm files
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("@mui")) {
              return "vendor_mui";
            }
            return "vendor"; // all other package goes here
          }
        },
      },
    },
  },
});
