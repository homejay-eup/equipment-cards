/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    loader: 'custom',
    loaderFile: './src/lib/cloudinaryLoader.ts',
  },
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
}

export default nextConfig;
