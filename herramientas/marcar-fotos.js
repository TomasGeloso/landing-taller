// Genera las fotos con marca de agua que se publican en el sitio.
//
//   originales/trabajos/...     fotos SIN marca (solo en tu computadora, no van a git ni al sitio)
//   originales/miniaturas/...
//        │
//        ▼   node marcar-fotos.js     (o:  npm run marcar  dentro de /herramientas)
//   img/trabajos/...            fotos CON marca (esto es lo que se publica)
//   img/miniaturas/...
//
// Nunca se modifica nada dentro de /originales. Se puede volver a correr cuando quieras:
// siempre parte de los originales, así que la marca no se acumula.
//
// Uso:  node marcar-fotos.js            marca todas las fotos
//       node marcar-fotos.js --solo-nuevas   marca solo las que todavía no tienen versión con marca

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const RAIZ = path.resolve(__dirname, '..');
const CARPETAS = ['trabajos', 'miniaturas'];
const SOLO_NUEVAS = process.argv.includes('--solo-nuevas');

// --- ajustes de la marca ---
const OPACIDAD = 0.42;      // transparencia de la marca (0 = invisible, 1 = sólida)
const ANCHO_REL = 0.24;     // ancho de cada logo, relativo al ancho de la foto
const ANGULO = -28;         // inclinación de la trama
const SEPARACION_X = 0.46;  // distancia horizontal entre logos (relativa al ancho de la foto)
const SEPARACION_Y = 0.20;  // distancia vertical entre filas
const CALIDAD_JPG = 86;

// Logo: se toma el path del wordmark del sitio
const svgLogo = fs.readFileSync(path.join(RAIZ, 'img/logo/annessi-wordmark.svg'), 'utf8');
const trazo = svgLogo.match(/<path[^>]* d="([^"]+)"/)[1];
const [vx, vy, vw, vh] = svgLogo.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);

function marca(ancho, alto) {
  const lw = ancho * ANCHO_REL;
  const esc = lw / vw;
  const lh = vh * esc;
  const tx = ancho * SEPARACION_X;
  const ty = lh + ancho * SEPARACION_Y;
  // tile de dos filas, la segunda desplazada medio paso (trama escalonada)
  const logo = (x, y) => `
    <g transform="translate(${x} ${y}) scale(${esc}) translate(${-vx} ${-vy})">
      <path d="${trazo}" fill="#000" fill-opacity="${OPACIDAD * 0.55}" transform="translate(1.6 2.4)"/>
      <path d="${trazo}" fill="#fff" fill-opacity="${OPACIDAD}"/>
    </g>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}">
  <defs>
    <pattern id="p" width="${tx}" height="${ty * 2}" patternUnits="userSpaceOnUse" patternTransform="rotate(${ANGULO})">
      ${logo(0, 0)}${logo(tx / 2, ty)}
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#p)"/>
</svg>`);
}

function* archivos(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* archivos(p);
    else if (/\.(jpe?g)$/i.test(e.name)) yield p;
  }
}

(async () => {
  let hechas = 0, saltadas = 0;
  for (const carpeta of CARPETAS) {
    const origen = path.join(RAIZ, 'originales', carpeta);
    if (!fs.existsSync(origen)) { console.log('No existe', origen); continue; }
    for (const f of archivos(origen)) {
      const rel = path.relative(path.join(RAIZ, 'originales'), f);
      const destino = path.join(RAIZ, 'img', rel);
      if (SOLO_NUEVAS && fs.existsSync(destino)) { saltadas++; continue; }
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      const base = sharp(f).rotate();                    // respeta la orientación EXIF
      const { width, height } = await base.clone().toBuffer({ resolveWithObject: true }).then(r => r.info);
      await base
        .composite([{ input: marca(width, height), top: 0, left: 0 }])
        .jpeg({ quality: CALIDAD_JPG, mozjpeg: true })   // sin EXIF ni ubicación
        .toFile(destino + '.tmp');
      fs.renameSync(destino + '.tmp', destino);
      hechas++;
    }
  }
  console.log(`Listo: ${hechas} fotos marcadas${SOLO_NUEVAS ? `, ${saltadas} ya existían` : ''}.`);
})();
