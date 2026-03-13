import { defineConfig } from "vite";
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

// Ensure Stockfish WASM files are in public/ for both dev and build
function copyStockfishFiles() {
  const dest = resolve(__dirname, "public/stockfish");
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });

  const sfDir = resolve(__dirname, "node_modules/stockfish/bin");
  const files = [
    ["stockfish-18-lite-single.js", "stockfish-18-lite-single.js"],
    ["stockfish-18-lite-single.wasm", "stockfish-18-lite-single.wasm"],
    // The JS loader references "stockfish.wasm" at runtime
    ["stockfish-18-lite-single.wasm", "stockfish.wasm"],
  ];

  for (const [src, dst] of files) {
    const srcPath = resolve(sfDir, src);
    const dstPath = resolve(dest, dst);
    if (existsSync(srcPath) && !existsSync(dstPath)) {
      copyFileSync(srcPath, dstPath);
    }
  }
}

copyStockfishFiles();

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 4173
  }
});
