import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Vitest no carga el plugin de Vite que genera este módulo virtual: se
      // resuelve a un manifiesto vacío, el mismo estado que producción.
      'virtual:paint-images': fileURLToPath(
        new URL('./src/data/images/emptyPaintImages.ts', import.meta.url),
      ),
    },
  },
  test: {
    // Los tests de UI necesitan DOM; los de color y catálogo son puros y no
    // sufren por correr en el mismo entorno.
    environment: 'jsdom',
  },
})
