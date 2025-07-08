import { defineConfig } from 'vite'

export default defineConfig({
  css: {
    postcss: './postcss.config.js'
  },
  build: {
    target: 'es2020',
    commonjsOptions: {
      include: [/@jscad\/.*/, /node_modules/],
      transformMixedEsModules: true,
      requireReturnsDefault: 'auto'
    }
  }
})
