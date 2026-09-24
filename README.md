# Paint Studio Miniatures

Catálogo de pinturas AK Interactive, recetas de pintado por miniatura y control
de lo que tienes en el armario. Todo corre en el navegador: no hay servidor ni
cuenta, y la colección se guarda en el propio equipo.

## Qué hace

- **Catálogo** — 1.130 referencias AK (3rd Generation, gama clásica y Real
  Colors) con swatch, referencia y gama. Búsqueda por nombre, código o gama,
  insensible a tildes, y filtros por línea y familia.
- **Recetas** — esquemas de pintado organizados por zona de la miniatura (piel,
  armadura, metales, peana…) y por rol dentro de la zona (base, sombra, lavado,
  luz, filo). Cada receta te dice cuántas referencias tienes ya y cuáles faltan,
  y manda las que faltan a la lista de compra de un clic.
- **Sustitutos** — si te falta una pintura de la receta, propone la más parecida
  de entre las que sí tienes, ordenada por diferencia real de color.
- **Buscar por color** — eliges un color, o subes la foto de una miniatura y se
  extraen sus colores dominantes; la app devuelve las referencias AK más
  cercanas.
- **Mi colección** — qué tienes, cuánto queda en cada bote, qué te falta por
  comprar, con exportación e importación en JSON.

## Arranque

```bash
npm install
npm run dev        # http://localhost:5173 (también accesible desde el móvil en la LAN)
```

| Script                  | Qué hace                                             |
| ----------------------- | ---------------------------------------------------- |
| `npm run dev`           | Servidor de desarrollo                                |
| `npm run build`         | Chequeo de tipos y build de producción en `dist/`     |
| `npm test`              | Tests (Vitest)                                        |
| `npm run lint`          | oxlint                                                |
| `npm run build:catalog` | Regenera `src/data/catalog.json` desde `data/raw/`    |

## Cómo está montado

```
data/raw/            Tablas de pinturas en markdown (fuente editable)
scripts/             build-catalog.ts: markdown → src/data/catalog.json
src/lib/color.ts     Conversión sRGB→CIELAB y distancia CIEDE2000
src/lib/catalog.ts   Búsqueda, filtros, matching y cobertura de recetas
src/lib/storage.ts   Persistencia en localStorage y respaldos
src/data/            catalog.json (generado) y recipes.json (semilla editable)
src/routes/          Una página por sección
```

**Por qué CIEDE2000 y no distancia RGB.** Dos colores pueden estar cerca en RGB
y verse muy distintos, y al revés. El matcher convierte a CIELAB y compara con
CIEDE2000, que modela cómo percibe el ojo las diferencias: por eso el orden de
resultados es el que esperarías delante del expositor. Como referencia, ΔE < 1
es indistinguible y ΔE > 10 son colores claramente distintos.

La implementación está verificada contra los vectores de Sharma, Wu & Dalal
(2005), el juego de pruebas canónico del estándar (`src/lib/color.test.ts`).

## Editar los datos

**Recetas.** `src/data/recipes.json`. Cada receta agrupa zonas y cada zona una
lista de pasos con `role` y `code`. Un test comprueba que ninguna receta apunta
a una referencia inexistente, así que un código mal escrito sale en `npm test`.
Las recetas que crees desde la app se guardan aparte, en el navegador, y una
receta propia con el mismo `id` reemplaza a la de semilla.

**Catálogo.** No edites `src/data/catalog.json` a mano: se regenera. Corrige
`data/raw/AK.md` o `data/raw/AKRC.md` y ejecuta `npm run build:catalog`.

## Sobre la precisión del color

Los valores hex provienen de [Arcturus5404/miniature-paints][fuente] (MIT) y son
**aproximaciones digitales** del color del bote, no medidas colorimétricas. Son
buenas para buscar, comparar y decidir; no sustituyen a ver la pintura aplicada.
Hay entradas concretas que se desvían —algunos grises de la 3rd Gen tiran a
crema, y AK11001 y AK11029 aparecen clasificados bajo «Intense» en vez de
«Standard»—. Todo eso se corrige en `data/raw/` y se regenera.

[fuente]: https://github.com/Arcturus5404/miniature-paints

## Licencia

Este proyecto se publica bajo licencia [MIT](LICENSE).

Los ficheros de datos de `data/raw/` son obra de terceros y mantienen su propia
licencia MIT, cuyo texto y aviso de copyright están en
[`data/raw/LICENSE.miniature-paints`](data/raw/LICENSE.miniature-paints).
