import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Los tests de UI necesitan DOM; los de color y catálogo son puros y no
    // sufren por correr en el mismo entorno.
    environment: 'jsdom',
  },
})
