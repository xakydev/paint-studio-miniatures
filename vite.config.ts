import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { paintImagesPlugin } from './vite/paintImagesPlugin.ts'

export default defineConfig({
  plugins: [
    // El React Compiler memoiza por nosotros: en este proyecto no se escribe
    // useMemo ni useCallback a mano.
    react({ compiler: true }),
    tailwindcss(),
    // Fotos locales de AK: solo el dev server las sirve; el build exporta {}.
    paintImagesPlugin(),
  ],
  server: {
    // Accesible desde el móvil en la misma red, que es donde se pinta.
    host: true,
  },
})
