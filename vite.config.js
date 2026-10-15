import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig(({ command, mode }) => {
  // 本機讀 .env；Cloudflare 組建時讀「變數和祕密」（process.env）
  const env = loadEnv(mode, process.cwd(), '')
  const googleClientId = env.GOOGLE_CLIENT_ID || ''

  if (command === 'build' && !googleClientId) {
    throw new Error(
      '找不到 GOOGLE_CLIENT_ID：請在本機 .env，或 Cloudflare「設定 → 組建 → 變數和祕密」加上這個變數。',
    )
  }

  return {
    plugins: [
      vue(),
      cloudflare({ config: { vars: { GOOGLE_CLIENT_ID: googleClientId } } }),
    ],
    define: {
      __GOOGLE_CLIENT_ID__: JSON.stringify(googleClientId),
    },
    server: {
      port: 5173,
      strictPort: true,
      // 只在本機 dev：Google 對 http://localhost 測試登入的要求
      headers: { 'Referrer-Policy': 'no-referrer-when-downgrade' },
    },
  }
})
