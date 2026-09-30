# Origen de los datos

Los ficheros `AK.md` y `AKRC.md` provienen del repositorio
[Arcturus5404/miniature-paints](https://github.com/Arcturus5404/miniature-paints)
(MIT License, Copyright (c) 2022 Rick Fleuren), que publica listados de pinturas
de miniaturas con código, gama y valor RGB/hex.

El texto íntegro de esa licencia está en `LICENSE.miniature-paints`, junto a los
ficheros que ampara. La MIT obliga a acompañar el aviso de copyright y la
licencia al redistribuir los datos, y este repositorio los redistribuye.

- `AK.md`   — gamas AK Interactive (3rd Gen, AFV, Air, Figures, Naval, General...)
- `AKRC.md` — gama AK Real Colors

Los valores hex son **aproximaciones digitales** del color real del bote: sirven
para buscar y comparar, no como prueba colorimétrica.

**No edites estos ficheros.** Están vendorizados tal cual para poder
actualizarlos de golpe desde el repositorio original. Lo que veas desviado se
corrige en `data/overrides.json`, que el build aplica encima; ver «Editar los
datos» en el README.
