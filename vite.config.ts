import { defineConfig } from "vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

/**
 * 이 앱은 프런트만 있다 — 숫자는 lge-billing-dashboard 백엔드의 /api/adv/* 에서 온다.
 * 배포에서는 nginx 가 /api 를 그 백엔드로 프록시하고, 로컬 dev 에서만 이 프록시를 쓴다.
 * 내부 대시보드 프런트(:3000)와 같이 띄울 수 있게 포트를 3100 으로 둔다.
 */
export default defineConfig({
  plugins: [tailwindcss(), viteReact()],
  server: {
    port: 3100,
    // 정산 백엔드를 다른 포트로 띄웠으면 API_TARGET 으로 넘긴다
    proxy: {
      "/api": {
        target: process.env.API_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
})
