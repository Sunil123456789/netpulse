import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return null
          if (
            id.includes('react/') ||
            id.includes('react-dom/') ||
            id.includes('react-router-dom') ||
            id.includes('zustand') ||
            id.includes('react-hot-toast')
          ) return 'react-vendor'
          if (id.includes('chart.js') || id.includes('react-chartjs-2')) return 'charts'
          if (id.includes('socket.io-client')) return 'socket'
          if (id.includes('axios') || id.includes('date-fns')) return 'data-utils'
          return null
        },
      },
    },
  },
  server: {
    host: '0.0.0.0', port: 3000,
    proxy: {
      '/api': { target: 'http://server:5000', changeOrigin: true },
      '/socket.io': { target: 'http://server:5000', ws: true },
    },
  },
})
