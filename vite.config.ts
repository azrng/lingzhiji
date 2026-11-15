import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // GitLab Pages 项目站点挂在子路径下（https://<user>.gitlab.io/lingzhiji/），
  // dev 与构建统一走该 base；public 资产的运行时引用见 src/assetUrl.ts。
  base: '/lingzhiji/',
  server: { port: 5173, strictPort: false },
})
