import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@postpilot/compression-engine': resolve(__dirname, '../services/compression-engine/src'),
      '@postpilot/transcoder': resolve(__dirname, '../services/transcoder/src'),
      '@postpilot/repurposing-engine': resolve(__dirname, '../services/repurposing-engine/src'),
      '@postpilot/targeting-engine': resolve(__dirname, '../services/targeting-engine/src'),
      '@postpilot/publishing-service': resolve(__dirname, '../services/publishing-service/src'),
      '@postpilot/asset-service': resolve(__dirname, '../services/asset-service/src'),
      '@postpilot/logger': resolve(__dirname, '../packages/logger/src/index.ts'),
      'ioredis': resolve(__dirname, '../node_modules/ioredis'),
    },
  },
  test: {
    globals: false,
  },
})
