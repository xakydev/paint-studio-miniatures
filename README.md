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
src/domain/             Tipos, reglas puras y transiciones: color, catálogo,
                        borrado lógico, fusión de recetas, respaldo
src/data/ports/         Contratos de persistencia (CollectionRepository, RecipeRepository)
src/data/local/         Adaptador de localStorage que implementa esos puertos
src/data/memory/        Adaptador en memoria, para tests
src/data/static/        catalog.json (generado) y recipes.json (semilla editable)
src/ui/                 Componentes, páginas y el LibraryProvider que las conecta
```

**Por qué CIEDE2000 y no distancia RGB.** Dos colores pueden estar cerca en RGB
y verse muy distintos, y al revés. El matcher convierte a CIELAB y compara con
CIEDE2000, que modela cómo percibe el ojo las diferencias: por eso el orden de
resultados es el que esperarías delante del expositor. Como referencia, ΔE < 1
es indistinguible y ΔE > 10 son colores claramente distintos.

La implementación está verificada contra los vectores de Sharma, Wu & Dalal
(2005), el juego de pruebas canónico del estándar (`src/domain/color.test.ts`).

## Arquitectura

Tres capas con dependencias en un solo sentido: `ui → data → domain`. `domain`
tiene los tipos y las reglas puras (borrado lógico, fusión de recetas, color);
`data` lee y escribe a través de los puertos que `domain` no conoce; `ui`
renderiza y llama a `data` mediante el `LibraryProvider`. `domain` no importa
de `data` ni de `ui`, y `data` no importa de `ui`: lo impone `oxlint`
(`no-restricted-imports` en `.oxlintrc.json`), así que una dependencia en el
sentido equivocado rompe `npm run lint`, no solo la revisión de código.

Los repositorios (`CollectionRepository`, `RecipeRepository`, en
`src/data/ports/`) son puertos asíncronos con `load`, `upsert` y `subscribe`
— no hay `delete`. Sin una operación de borrado físico, ningún adaptador
puede perder datos por accidente: solo puede fundir por clave y sobrescribir,
nunca eliminar filas que no le pasas explícitamente.
El adaptador de localStorage va más lejos: funde sobre lo guardado en bruto,
así que un registro que no sabe leer (de otra versión, con un campo nuevo) se
conserva aunque no se muestre, y un valor ilegible se aparta a
`<clave>:corrupt:<fecha>` antes de escribir encima, para rescatarlo a mano.

Por eso quitar una pintura o una receta propia es un borrado lógico: la
entrada se marca con `deletedAt` en vez de desaparecer, nunca se purga, y las
vistas la excluyen filtrando por ese campo. Un respaldo exportado incluye
también lo borrado, así que importar un respaldo antiguo puede recuperarlo.
Vaciar la colección y descartar una pintura ausente de un respaldo importado
son, por dentro, el mismo mecanismo: un `upsert` con `deletedAt`.

Las claves `paint-studio-miniatures:collection:v1` y
`paint-studio-miniatures:recipes:v1` de localStorage son un contrato: cambiar
su nombre, o el formato de lo que guardan bajo la misma clave, perdería los
datos de quien ya tiene la app instalada. Un registro antiguo sin `deletedAt`
se sigue leyendo sin error y se trata como activo.

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
