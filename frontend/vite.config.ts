import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // deriveDashboard is a pure module — no DOM needed.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
