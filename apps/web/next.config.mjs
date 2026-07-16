import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for the standalone Docker image
  output: 'standalone',
  // Required in a monorepo to trace dependencies correctly
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  // Temporarily ignore lint errors during build to verify compilation
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
