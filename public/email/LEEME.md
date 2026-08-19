# Imágenes de los correos

Copias de tamaño fijo de `public/brand/`, pensadas solo para el correo. **No las
uses en la web**: ahí va `next/image` sobre los originales, que genera AVIF y
WebP a la medida de cada pantalla.

Acá hacen falta archivos ya dimensionados porque ningún cliente de correo
entiende `srcset`, y las URLs de `/_next/image?...` no se resuelven fuera del
sitio.

| Archivo | Origen | Se muestra a | Por qué el doble |
|---|---|---|---|
| `lockup-600.png` | `brand/lockup.png` | 230 px | pantallas densas |

Es el **único** logo que viaja al correo. El isotipo se quitó porque el lockup
ya dice «RIQUELME + Betano»: eran dos firmas de la misma marca, y la del isotipo
se comía una franja entera de la pieza sin aportar nada.

Para regenerarlas tras cambiar un original:

```bash
node -e "
const sharp = require('sharp');
(async () => {
  for (const [src, w, out] of [['lockup', 600, 'lockup-600']]) {
    await sharp('public/brand/' + src + '.png')
      .resize({ width: w }).png({ compressionLevel: 9, palette: true })
      .toFile('public/email/' + out + '.png');
  }
})();
"
```

El lockup es blanco sobre transparente: necesita fondo oscuro o el naranja de
campaña, nunca uno claro. En el correo va sobre el ink.
