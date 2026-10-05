# Paint Studio Miniatures

Catálogo de pinturas AK Interactive, recetas de pintado por miniatura y control
de lo que tienes en el armario. Todo corre en el navegador: no hay servidor ni
cuenta, y la colección se guarda en el propio equipo.

## Qué hace

- **Catálogo** — 287 referencias de AK 3rd Generation pensadas para miniatura:
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
                        check-bundle-secrets.ts y check-bundle-assets.ts: vigilan dist/
                        al final de npm run build
                        fetch-images.ts: descarga a mano las fotos de AK (ver más abajo)
vite/                   paintImagesPlugin.ts: sirve las fotos locales solo en desarrollo
data/ak-images.json     Mapa código → URL pública de cada foto de AK, sin imágenes
                        (lo genera fetch:images y se versiona)
local-assets/           Fotos descargadas. Ignorada por git; nunca llega a dist/
.githooks/              pre-commit: rechaza cualquier foto antes de que entre al historial
supabase/               config.toml, migrations/ y tests/database/ (pgTAP) del backend opcional
src/domain/             Tipos, reglas puras y transiciones: color, catálogo,
                        borrado lógico, fusión de recetas, respaldo
src/data/ports/         Contratos de persistencia y de sesión (CollectionRepository,
                        RecipeRepository, AuthGateway, Backend, UploadMarker)
src/data/local/         Adaptador de localStorage que implementa esos puertos
src/data/memory/        Adaptador en memoria, para tests
src/data/static/        catalog.json (generado) y recipes.json (semilla editable)
src/data/images/        Adaptador de fotos locales (PaintImages) sobre el manifiesto
src/data/supabase/      Adaptador remoto opcional: implementa Backend y AuthGateway
                        con @supabase/supabase-js; es el único módulo que lo importa
src/ui/                 Componentes, páginas y el LibraryProvider que las conecta
src/main.tsx            Raíz de composición: construye el backend (o null), elige
                        el adaptador de fotos y monta <App>
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

`main.tsx` es la raíz de composición: el único sitio que sabe que el backend
es Supabase. Lee `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` y, solo
si las dos están presentes, hace un `import()` dinámico de
`data/supabase/backend.ts` y se lo pasa a `<App backend={…} />`; sin
configuración, o si ese trozo no llega a cargar, `App` recibe `null` y la app
funciona en local como siempre. Por eso el SDK de Supabase (`@supabase/supabase-js`,
más de 200 kB) solo se descarga cuando hace falta: quien usa la app sin cuenta
no lo paga. `App` no lee el entorno ni importa el SDK: recibe el `Backend` ya
construido, elige entre los repositorios locales y los remotos según la
sesión, y sus tests usan un backend falso. Una regla de `oxlint`
(`no-restricted-imports` en `.oxlintrc.json`) impide importar
`@supabase/supabase-js` fuera de `src/data/supabase/`, así que una dependencia
que se cuele por otro sitio rompe `npm run lint`, no solo la revisión de
código.

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

## Backend opcional: sincronizar con Supabase

La app no necesita cuenta ni servidor para nada de lo descrito arriba. Hay,
además, un backend opcional con Supabase para quien quiera tener su colección
disponible en más de un equipo: inicias sesión con un enlace mágico (sin
contraseña) y tu colección y tus recetas propias viajan contigo. Lo que
**todavía no hace** es sincronización bidireccional continua ni tiempo real:
eso es la fase siguiente del proyecto. Por ahora, una vez dentro, el
dispositivo con el que entraste lee y escribe en remoto, pero un cambio hecho
en otro dispositivo no aparece solo hasta que recargas.

**Sin configurar las variables de entorno, todo sigue exactamente igual que
antes**: local, en el propio equipo, sin red y sin botón de «Entrar».

### Seguridad

Postgres es la frontera de seguridad, no el cliente:

- **RLS por usuario.** Cada fila de `collection_entries`, `recipes` y
  `change_log` solo la lee y escribe su dueño (`auth.uid() = user_id`); el rol
  `anon` no tiene ningún `GRANT`.
- **Sin DELETE en ninguna capa.** No hay política de borrado, los `GRANT` no
  incluyen `DELETE` ni `TRUNCATE` para ningún rol (tampoco `service_role`, que
  se salta la RLS) y un trigger bloquea el borrado físico aunque alguien lo
  intente desde el editor SQL del panel. Borrar de verdad es siempre un
  borrado lógico (`deleted_at`), igual que en local.
- **Guardia de escritura más reciente (LWW).** Un `UPDATE` con `updated_at`
  más antiguo que el guardado se descarta en silencio en vez de pisar un dato
  más nuevo; no aborta el resto del lote.
- **Auditoría en `change_log`.** Cada `UPDATE` aplicado queda registrado
  (`action = 'updated'`), y también cada uno que la guardia LWW rechaza
  (`action = 'rejected_stale'`): sin ese registro, un reloj atrasado perdería
  una edición legítima sin dejar rastro. Cada usuario puede leer su propio
  historial; nadie puede escribirlo ni modificarlo directamente.
- **El catálogo no va a la base de datos.** Es el mismo para todo el mundo y
  vive en el propio bundle (`src/data/static/catalog.json`); solo tus datos
  personales (colección y recetas) viajan a Supabase.

### Secretos

- `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` son **públicas**:
  viajan en el bundle de producción y la seguridad no depende de esconderlas,
  sino de la RLS.
- La clave **secreta** (prefijo `sb_secret_`, o la antigua `service_role`)
  nunca va en el cliente. `src/secrets.test.ts` recorre todo `src/` buscando
  ese prefijo y el literal `service_role`, y falla si aparece alguno.
- `scripts/check-bundle-secrets.ts` se añade a `npm run build`
  (`tsc -b && vite build && node scripts/check-bundle-secrets.ts`) y hace lo
  mismo contra `dist/`, además de decodificar cualquier JWT que encuentre por
  si su rol es `service_role`. Busca `sb_secret_` seguido de contenido
  (`sb_secret_[\w-]+`), no el prefijo a secas, porque el propio SDK de
  `@supabase/supabase-js` trae ese literal para reconocer el formato de clave
  nuevo; con el prefijo pelado, el build fallaría siempre, incluso sin
  ninguna clave filtrada.

### Desarrollo local con Docker/OrbStack

Hace falta Docker (u OrbStack) para levantar Supabase en el propio equipo:

| Script             | Qué hace                                                        |
| ------------------ | ---------------------------------------------------------------- |
| `npm run db:start` | `supabase start`: levanta Postgres, Auth, la API y Mailpit        |
| `npm run db:reset` | `supabase db reset`: aplica las migraciones de `supabase/migrations/` desde cero |
| `npm run db:test`  | `supabase test db`: corre los pgTAP de `supabase/tests/database/` |
| `npm run db:types` | `supabase gen types typescript --local`: regenera `src/data/supabase/database.types.ts` |

`npx supabase status` imprime la URL de la API y la clave publicable que van
en `.env.local` (copia de `.env.example`). Con la configuración de este
repositorio (`supabase/config.toml`), la API local queda en
`http://127.0.0.1:54321` (`[api] port`).

Los enlaces mágicos no se envían de verdad en local: se leen en **Mailpit**,
en `http://127.0.0.1:54324` (`[local_smtp] port`). `site_url` y
`additional_redirect_urls` en `config.toml` admiten `localhost` y `127.0.0.1`
en el puerto de Vite (5173); para abrir el enlace desde el móvil en la misma
red hay que añadir ahí la IP de la LAN (p. ej.
`"http://192.168.1.20:5173/**"`) y reiniciar el stack.

Para parar el stack: `npx supabase stop`.

### El primer login

La primera vez que inicias sesión, la app sube tu colección local completa a
tu cuenta de una sola vez —entradas borradas (tombstones) incluidas—, para
que el histórico de respaldos siga siendo coherente. La guardia LWW del
servidor evita pisar datos remotos más nuevos que los que llegan en el
volcado. Las entradas que violarían una restricción de dominio (por ejemplo,
un `level` fuera de 0..3 guardado por una versión antigua) se separan, se
sube el resto, y la app avisa de cuántas se saltaron: siguen intactas en
local, nada se pierde.

La copia local **no se toca**: si cierras sesión, vuelves a verla tal cual
estaba. La marca de "ya se volcó" es por dispositivo, no por cuenta, así que
lo que edites en local después de ese primer volcado (con la sesión cerrada)
no se vuelve a subir solo: eso llega con la sincronización bidireccional de
la fase siguiente.

### Pasos en producción (fuera de alcance de este repositorio)

Lo de arriba cubre el desarrollo local. Para desplegar tu propio backend:

1. Crear el proyecto en [supabase.com](https://supabase.com).
2. `npx supabase link`, para asociar este repositorio con ese proyecto.
3. `npx supabase db push`, que aplica las mismas migraciones de
   `supabase/migrations/` que ya corren en local.
4. En el panel del proyecto, configurar la **Site URL** y las **Redirect
   URLs** (Authentication → URL Configuration) con el dominio real.
5. Poner `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` de ese
   proyecto (panel → Settings → API Keys) donde despliegues la app.

### Borrar una cuenta con datos falla, a propósito

La clave foránea de `user_id` hacia `auth.users` es `on delete restrict`, y
además hay un trigger anti-borrado en las tablas de datos. Eso significa que
borrar un usuario que ya tiene colección o recetas guardadas **falla**: no es
un bug, es la misma garantía de "nada se borra físicamente" aplicada también
a la cuenta. Ni siquiera `service_role` (que se salta la RLS) puede saltarse
el trigger. Eliminar una cuenta con datos exige un proceso manual explícito:
una migración que retire el trigger de borrado, borre entonces las filas del
usuario y lo vuelva a crear; un acto visible y revisable, nunca un `DELETE`
directo desde la app.

## Fotos de los botes (opcional, solo en local)

Las tarjetas del catálogo pueden mostrar la foto del bote en vez del swatch de
color. Las fotos **no están en el repositorio y nunca lo estarán**: son de AK
Interactive, y su [aviso legal](https://ak-interactive.com/legal-notice/)
prohíbe reproducirlas o distribuirlas sin su permiso por escrito. Este proyecto
las descarga solo para uso personal, en tu equipo, y se asegura de que no
salgan de él. Si no las descargas, la app se ve exactamente igual que siempre.

```bash
npm install            # activa también el hook de .githooks/ (ver abajo)
npm run fetch:images   # unos minutos: una petición por segundo
npm run dev            # reinícialo si ya estaba arrancado
```

`fetch:images` lee los sitemaps de producto de la web de AK, se queda con las
fotos cuyo nombre es exactamente un código del catálogo (`AK11179.jpg`; nada de
Real Colors ni de miniaturas `-300x300`), las reduce a WebP de 320 px y las
guarda en `local-assets/paints/`. Es idempotente: lo ya descargado no se vuelve
a pedir, y si se corta a medias continúa donde se quedó. Se identifica con un
`User-Agent` que enlaza a este repositorio.

**Si encuentra menos del 95 % de las fotos, se aborta sin descargar nada**,
porque casi siempre significa que la web de AK ha cambiado. Si de verdad AK no
tiene foto de alguna referencia, añádela a `excluded` en `data/ak-images.json`
con el motivo, y vuelve a lanzarlo: las exclusiones quedan a la vista en el
diff en lugar de esconderse en el porcentaje. Al abortar, el script lista los
códigos que no encontró. Si es la primera ejecución y el fichero aún no
existe, créalo con esta forma (`images` y `missing` los rellena el script):

```json
{
  "images": {},
  "excluded": { "AK11999": "AK no publica foto de esta referencia" },
  "missing": []
}
```

### Por qué no salen de tu equipo

Las fotos viven fuera de `public/`, así que Vite nunca las copia al build. Solo
las sirve el servidor de desarrollo (`vite/paintImagesPlugin.ts`), también a tu
red local para verlas desde el móvil mientras pintas. En el build, el módulo
`virtual:paint-images` es siempre un objeto vacío aunque haya fotos en el
disco: producción no puede referenciar ninguna. `vite preview` tampoco las
sirve, porque se comporta como producción.

Por si algo falla, hay tres redes y todas son automáticas:

| Red | Cuándo actúa | Qué hace |
|---|---|---|
| `.githooks/pre-commit` | Al hacer commit | Rechaza el commit si incluye algo de `local-assets/` o un `AK….webp/jpg/png` |
| `scripts/trackedAssets.test.ts` | En `npm test` | Falla si git sigue algo bajo `local-assets/` (p. ej. tras un `--no-verify`) |
| `scripts/check-bundle-assets.ts` | En `npm run build` | Falla si `dist/` tiene una imagen raster fuera de la lista blanca, un `AK…` o una referencia a las fotos |

El hook lo activa el script `prepare` en cada `npm install`, con
`git config core.hooksPath .githooks`. Para desactivarlo:
`git config --unset core.hooksPath`. Un `git revert` de este cambio no lo hace
por ti, porque es configuración local de tu repositorio, no un fichero.

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
