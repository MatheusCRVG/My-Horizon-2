import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "financeiro-offline",
      generateBundle(_options, bundle) {
        const assets = [
          "/",
          "/index.html",
          "/manifest.webmanifest",
          "/icon-192.png",
          "/icon-512.png",
          "/favicon.svg",
          "/privacidade.html",
          ...["brand", "covers", "previews"].flatMap((dir) =>
            readdirSync(`public/${dir}`)
              .filter((f) => /\.(svg|webp|png)$/.test(f))
              .map((f) => `/${dir}/${f}`),
          ),
          ...Object.keys(bundle).map((f) => "/" + f),
        ];
        const version = createHash("sha256")
          .update(assets.join("|") + Date.now())
          .digest("hex")
          .slice(0, 12);
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: `const CACHE='financeiro5-${version}';const ASSETS=${JSON.stringify(assets)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('financeiro5-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match('/index.html')));return}if(ASSETS.includes(u.pathname))e.respondWith(caches.match(e.request,{ignoreVary:true}).then(r=>r||fetch(e.request)))});`,
        });
      },
    },
  ],
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  server: {
    watch: {
      ignored: [
        "**/test-results*/**",
        "**/playwright-report/**",
        "**/artifacts/**",
        "**/src-tauri/**",
        "**/releases/**",
      ],
    },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
