import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The embedding runtime ships native binaries and loads model files at
  // runtime; bundling it breaks both. Load it from node_modules instead.
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'pg'],
}

export default nextConfig
