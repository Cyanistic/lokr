import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import * as child from "child_process";

const commitHash = child.execSync("git rev-parse HEAD").toString();
const ReactCompilerConfig = {
  target: "19",
};

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", ReactCompilerConfig]],
      },
    }),
    wasm(),
  ],
  assetsInclude: ["**/*.wasm"], // ✅ Ensure Vite recognizes .wasm files
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash.trim()), // Expose commit hash to the application
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("@mui")) {
              return "vendor_mui";
            } 
            // else if (id.includes("react")) {
            //   return "vendor_react";
            // }
            return "vendor"; // all other package goes here
          }
        },
      },
    },
  },
});
