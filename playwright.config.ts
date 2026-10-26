import { defineConfig } from "@playwright/test";

// La interfaz con la capa de datos simulada (src/api/fake.ts).
// El motor real se prueba en src-tauri/tests (cargo test).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:1420/",
    viewport: { width: 1040, height: 680 },
    permissions: ["clipboard-read", "clipboard-write"],
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  webServer: { command: "npx vite --port 1420 --strictPort", url: "http://localhost:1420/", reuseExistingServer: true },
});
