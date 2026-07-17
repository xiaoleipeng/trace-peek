import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 纯前端应用，无后端。构建为静态资源即可本地打开或部署到任意静态托管。
export default defineConfig({
  plugins: [react()],
  base: "./",
  worker: {
    format: "es",
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["src/testSetup.ts"],
  },
});
