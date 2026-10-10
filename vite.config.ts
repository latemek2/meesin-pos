import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // แจ้งให้กดอัปเดตเอง ไม่รีโหลดกลางบิล (ดู UpdateBanner)
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'มีศิลป์ POS',
        short_name: 'มีศิลป์ POS',
        description: 'ระบบขายหน้าร้านและหลังบ้าน ร้านมีศิลป์',
        lang: 'th',
        start_url: '/pos',
        scope: '/',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#f4f3ef',
        theme_color: '#1f3b34',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // ข้อมูลจาก Supabase ต้องสดเสมอ ไม่เก็บแคช
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//],
      },
    }),
  ],
});
