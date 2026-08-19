# Imágenes de los correos

Copias de tamaño fijo de `public/brand/`, pensadas solo para el correo. **No las
uses en la web**: ahí va `next/image` sobre los originales, que genera AVIF y
WebP a la medida de cada pantalla.

Acá hacen falta archivos ya dimensionados porque ningún cliente de correo
entiende `srcset`, y las URLs de `/_next/image?...` no se resuelven fuera del
sitio.

| Archivo | Origen | Se muestra a | Por qué el doble |
|---|---|---|---|
| `iso-96.png` | `brand/isoBetano.png` | 48 px | pantallas densas |
| `lockup-600.png` | `brand/lockup.png` | 300 px | pantallas densas |

Para regenerarlas tras cambiar un original:

```bash
node -e "
const sharp = require('sharp');
(async () => {
  for (const [src, w, out] of [['isoBetano', 96, 'iso-96'], ['lockup', 600, 'lockup-600']]) {
    await sharp('public/brand/' + src + '.png')
      .resize({ width: w }).png({ compressionLevel: 9, palette: true })
      .toFile('public/email/' + out + '.png');
  }
})();
"
```

Sobre qué fondo va cada una, que no es intercambiable:

- **isotipo** — la B es roja y el rayo va *calado* (transparente). Sobre el ink se
  lee perfecto; sobre el naranja de campaña queda rojo sobre naranja y
  desaparece. Va en las franjas oscuras.
- **lockup** — blanco sobre transparente. Necesita fondo oscuro o el naranja.
  Nunca sobre claro.
