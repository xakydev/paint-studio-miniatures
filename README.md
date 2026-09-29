# Paint Studio Miniatures

Catálogo de pinturas AK Interactive, recetas de pintado por miniatura y control
de lo que tienes en el armario. Todo corre en el navegador: no hay servidor ni
cuenta, y la colección se guarda en el propio equipo.

## Qué hace

- **Catálogo** — 286 referencias de AK 3rd Generation pensadas para miniatura:
  Standard, Figures, Metallic, The Inks, Intense, Pastel, imprimaciones y
  auxiliares. Búsqueda por nombre, código o gama, insensible a tildes, y filtros
  por familia. Las subgamas Air y AFV quedan fuera a propósito: son cartas
  RAL/FS de camuflaje para maqueta histórica.
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
| `npm run build:catalog` | Regenera `src/data/static/catalog.json` desde `data/raw/` |

## Cómo está montado

```
data/raw/               Tablas de pinturas de terceros, vendorizadas sin tocar
data/overrides.json     Nuestras correcciones sobre esa fuente
scripts/                build-catalog.ts: raw + overrides → src/data/static/catalog.json
src/domain/color.ts     Conversión sRGB→CIELAB y distancia CIEDE2000
src/domain/catalog.ts   Búsqueda, filtros, matching y cobertura de recetas
src/lib/storage.ts      Persistencia en localStorage y respaldos
src/data/static/        catalog.json (generado) y recipes.json (semilla editable)
src/ui/routes/          Una página por sección
```

**Por qué CIEDE2000 y no distancia RGB.** Dos colores pueden estar cerca en RGB
y verse muy distintos, y al revés. El matcher convierte a CIELAB y compara con
CIEDE2000, que modela cómo percibe el ojo las diferencias: por eso el orden de
resultados es el que esperarías delante del expositor. Como referencia, ΔE < 1
es indistinguible y ΔE > 10 son colores claramente distintos.

La implementación está verificada contra los vectores de Sharma, Wu & Dalal
(2005), el juego de pruebas canónico del estándar (`src/domain/color.test.ts`).

## Editar los datos

**Recetas.** `src/data/static/recipes.json`. Cada receta agrupa zonas y cada zona una
lista de pasos con `role` y `code`. Un test comprueba que ninguna receta apunta
a una referencia inexistente, así que un código mal escrito sale en `npm test`.
Las recetas que crees desde la app se guardan aparte, en el navegador, y una
receta propia con el mismo `id` reemplaza a la de semilla.

**Catálogo.** No edites `src/data/static/catalog.json` a mano: se regenera. Tampoco
edites `data/raw/`: son ficheros de terceros que conviene poder actualizar de
golpe. Las correcciones van en `data/overrides.json`, que el build aplica encima
de la fuente y así sobreviven a refrescar los datos:

```json
{
  "fix":  { "AK11001": { "family": "standard", "why": "la fuente lo marca Intense" } },
  "add":  { "AK11999": { "name": "…", "family": "ink", "hex": "#112233", "why": "…" } },
  "drop": { "AK11998": { "why": "…" } }
}
```

`fix` corrige `name`, `family` o `hex` de una referencia existente; `add` mete
una que la fuente no trae; `drop` quita una. El campo `why` es obligatorio: un
override sin motivo es indistinguible de una errata.

El build valida cada entrada y **falla** si alguna ha quedado obsoleta —un `fix`
que ya coincide con la fuente, un `add` de algo que ahora sí existe, un `drop`
de algo que ya no está—. Así, al actualizar `data/raw/`, el propio
`npm run build:catalog` dice qué correcciones borrar en vez de arrastrarlas para
siempre.

## Sobre la precisión del color

Los valores hex provienen de [Arcturus5404/miniature-paints][fuente] (MIT) y son
**aproximaciones digitales** del color del bote, no medidas colorimétricas. Son
buenas para buscar, comparar y decidir; no sustituyen a ver la pintura aplicada.
Hay entradas concretas que se desvían: algunos grises de la 3rd Gen tiran a
crema —AK11006 «Silver Grey» sale `#E2D7B7`, un beige— y la fuente clasifica
AK11001 y AK11029 bajo «Intense» en vez de «Standard». Esas dos familias ya
están corregidas en `data/overrides.json`; los hex desviados siguen pendientes
de medir sobre pintura aplicada, no de adivinar.

[fuente]: https://github.com/Arcturus5404/miniature-paints

## Licencia

Este proyecto se publica bajo licencia [MIT](LICENSE).

Los ficheros de datos de `data/raw/` son obra de terceros y mantienen su propia
licencia MIT, cuyo texto y aviso de copyright están en
[`data/raw/LICENSE.miniature-paints`](data/raw/LICENSE.miniature-paints).
