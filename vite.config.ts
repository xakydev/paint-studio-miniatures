import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // El React Compiler memoiza por nosotros: en este proyecto no se escribe
    // useMemo ni useCallback a mano.
    react({ compiler: true }),
    tailwindcss(),
  ],
  server: {
    // Accesible desde el móvil en la misma red, que es donde se pinta.
    host: true,
  },
})
