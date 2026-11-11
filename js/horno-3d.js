/**
 * <horno-3d> — visor 3D del horno rotativo (estructura), sin dependencias (WebGL puro).
 *
 * Uso:
 *   <script src="js/horno-3d.js" defer></script>
 *   <horno-3d style="height:520px"></horno-3d>
 *
 * Atributos:
 *   abierto   la tapa arranca abierta
 *   sin-ui    oculta los botones (si querés controlarlo desde afuera)
 *
 * API JS:  el.abrir()  el.cerrar()  el.alternar()  el.vistaInicial()
 * Evento:  "tapa" → e.detail.abierta (true/false)
 *
 * Colores (CSS):  horno-3d { --h3d-bg: #e6eaed; --h3d-ui: #1d2125; --h3d-accent: #e4572e; }
 *
 * Modelo ilustrativo armado a partir del video: proporciones aproximadas.
 * Solo se muestran el frente y los laterales (la cámara no permite ver la parte de atrás).
 */

(function () {
'use strict';

/* ------------------------------------------------------------------ math */
const M = {
  id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++)
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  },
  t: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
  s: (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1],
  rx(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
  persp(fov, asp, n, f) {
    const t = 1 / Math.tan(fov / 2);
    return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0];
  },
  look(e, c, u) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const nrm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const z = nrm(sub(e, c)), x = nrm(cr(u, z)), y = cr(z, x);
    const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -d(x, e), -d(y, e), -d(z, e), 1];
  },
  // inversa-transpuesta 3x3 (para normales)
  nmat(m) {
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
    const G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
    const det = a * A + b * B + c * C || 1;
    return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, H / det, I / det];
  },
  apply(m, p) {
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  },
};

/* -------------------------------------------------------------- geometry */
// Cada geometría = lista de triángulos [[p,p,p],...] en coordenadas del mundo.
function tri(out, a, b, c) { out.push([a, b, c]); }
function quad(out, a, b, c, d) { tri(out, a, b, c); tri(out, a, c, d); }

function box(x0, y0, z0, x1, y1, z1) {
  const o = [];
  const p = (x, y, z) => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0];
  quad(o, p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)); // +z
  quad(o, p(1, 0, 0), p(0, 0, 0), p(0, 1, 0), p(1, 1, 0)); // -z
  quad(o, p(1, 0, 1), p(1, 0, 0), p(1, 1, 0), p(1, 1, 1)); // +x
  quad(o, p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)); // -x
  quad(o, p(0, 1, 1), p(1, 1, 1), p(1, 1, 0), p(0, 1, 0)); // +y
  quad(o, p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)); // -y
  return o;
}

// Triangulación por "ear clipping" de un polígono simple (sin agujeros).
function triangulate(pts) {
  const area = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  const idx = pts.map((_, i) => i);
  if (area < 0) idx.reverse();
  const res = [];
  const inside = (p, a, b, c) => {
    const s = (u, v, w) => (u[0] - w[0]) * (v[1] - w[1]) - (v[0] - w[0]) * (u[1] - w[1]);
    const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross <= 1e-12) continue;
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inside(pts[j], a, b, c))) continue;
      res.push([ia, ib, ic]);
      idx.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) res.push([idx[0], idx[1], idx[2]]);
  return { tris: res, ccw: area >= 0 };
}

// Extruye un polígono 2D (u,v) con espesor w0..w1; map(u,v,w) → [x,y,z]
function extrude(pts, w0, w1, map) {
  const o = [];
  const { tris } = triangulate(pts);
  const area = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  const P = area >= 0 ? pts : [...pts].reverse();
  const T = area >= 0 ? tris : triangulate(P).tris;
  for (const [a, b, c] of T) {
    tri(o, map(...P[a], w1), map(...P[b], w1), map(...P[c], w1));
    tri(o, map(...P[c], w0), map(...P[b], w0), map(...P[a], w0));
  }
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    quad(o, map(...a, w0), map(...b, w0), map(...b, w1), map(...a, w1));
  }
  return o;
}
const YZ = (u, v, w) => [w, v, u]; // u=z, v=y, w=x  (placas de los extremos)

function arc(cx, cy, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}

// cilindro unitario: eje Y de 0 a 1, radio 1
function cylinder(seg = 20) {
  const o = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a, y) => [Math.cos(a), y, Math.sin(a)];
    quad(o, p(a0, 0), p(a1, 0), p(a1, 1), p(a0, 1));
    tri(o, [0, 1, 0], p(a1, 1), p(a0, 1));
    tri(o, [0, 0, 0], p(a0, 0), p(a1, 0));
  }
  return o;
}
// cilindro con eje X, centrado en (x,y,z)
function cylX(x, y, z, r, len, seg = 24) {
  return cylinder(seg).map((t) => t.map(([a, b, c]) => [x - len / 2 + b * len, y + a * r, z + c * r]));
}
function cylY(x, y, z, r, len, seg = 16) {
  return cylinder(seg).map((t) => t.map(([a, b, c]) => [x + a * r, y + b * len, z + c * r]));
}

/* ---------------------------------------------------------------- modelo */
// Unidades ≈ metros relativos. X = largo (izq→der), Y = alto, Z = profundidad (+Z = frente).
const C = {
  blanco: [0.93, 0.94, 0.95],
  interior: [0.74, 0.77, 0.79],
  cuna: [0.9, 0.91, 0.92],
  negro: [0.12, 0.12, 0.13],
  bronce: [0.78, 0.62, 0.32],
  cromo: [0.8, 0.82, 0.85],
  rojo: [0.89, 0.3, 0.16],
  pata: [0.82, 0.84, 0.86],
};

const L = 0.75;        // medio largo del cuerpo
const Dz = 0.435;      // media profundidad
const Y0 = 0.12;       // base del cuerpo (altura de patas)
const YS = 0.92;       // junta tapa / cuerpo (recta en todo el contorno)
const YT = 1.16;       // techo de la tapa
const YC = 0.845;       // centro del orificio del crisol (extremos)
const R_H = 0.045;     // radio del orificio del crisol
const W_T = 0.13, W_B = 0.1; // medio ancho del saliente de la tapa: arriba (en la junta) y abajo (en el orificio)
const T = 0.02;        // espesor de chapa
const PIV = [1.01, -0.47]; // eje de la bisagra (y, z)
const STEP_X1 = 1.35, STEP_Y = 0.74;

function buildModel() {
  const body = [], lid = [];
  const add = (list, geo, color, spec = 0.08) => list.push({ geo, color, spec });

  /* --- cuerpo inferior --- */
  add(body, box(-L, Y0, Dz - T, L, YS, Dz), C.blanco);            // frente
  add(body, box(-L, Y0, -Dz, L, YS, -Dz + T), C.blanco);          // atrás
  add(body, box(-L, Y0, -Dz, L, Y0 + T, Dz), C.blanco);           // piso
  add(body, box(-L + T, Y0 + T, Dz - T - 0.006, L - T, YS, Dz - T), C.interior);   // forro frente
  add(body, box(-L + T, Y0 + T, -Dz + T, L - T, YS, -Dz + T + 0.006), C.interior); // forro atrás
  add(body, box(-L + T, Y0 + T, -Dz + T, L - T, Y0 + T + 0.006, Dz - T), C.interior); // forro piso

  // placas de los extremos: borde superior recto, con el hueco para el saliente de la tapa
  // y el semicírculo inferior (donde apoya el eje del crisol)
  const endLower = [
    [Dz, Y0], [Dz, YS], [W_T, YS], [W_B, YC], [R_H, YC],
    ...arc(0, YC, R_H, 0, -Math.PI, 14).slice(1, -1),
    [-R_H, YC], [-W_B, YC], [-W_T, YS], [-Dz, YS], [-Dz, Y0],
  ];
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? L - T : -L, x1 = x0 + T;
    add(body, extrude(endLower, x0, x1, YZ), C.blanco);
  }

  // patas
  for (const x of [-L + 0.03, L - 0.03]) for (const z of [-Dz + 0.03, Dz - 0.03])
    add(body, box(x - 0.025, 0, z - 0.025, x + 0.025, Y0, z + 0.025), C.pata);

  /* --- bloque del extremo derecho (en voladizo, sin patas) con engranaje y rodillos --- */
  add(body, box(L, 0.24, -Dz, STEP_X1, STEP_Y, Dz), C.blanco);
  // ranura + segmento dentado (arco) asomando del escalón
  const gx = L + 0.13;
  add(body, box(gx - 0.03, STEP_Y, -0.13, gx + 0.03, STEP_Y + 0.002, 0.13), C.negro);
  const gc = STEP_Y - 0.11, gr = 0.16, teeth = [];
  const a0 = Math.asin((STEP_Y - gc) / gr), a1 = Math.PI - a0;
  const n = 44;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n, r = i % 2 ? gr + 0.008 : gr;
    teeth.push([Math.cos(a) * r, gc + Math.sin(a) * r]);
  }
  add(body, extrude([[teeth[0][0], STEP_Y - 0.01], ...teeth, [teeth[n][0], STEP_Y - 0.01]], gx - 0.024, gx + 0.024, YZ), C.negro, 0.25);
  // patines: soporte blanco + 2 rodillos (contra la pared, a ambos lados del equipo)
  const patines = (s) => {
    const xw = s * L, rx = s * (L + 0.045);
    add(body, extrude([[-0.12, STEP_Y], [0.12, STEP_Y], [0.1, STEP_Y + 0.05], [-0.1, STEP_Y + 0.05]], s > 0 ? xw : xw - 0.012, s > 0 ? xw + 0.012 : xw, YZ), C.blanco);
    for (const z of [-0.075, 0.075]) {
      add(body, cylX(rx, STEP_Y + 0.03, z, 0.026, 0.026), C.bronce, 0.5);
      add(body, cylX(rx + s * 0.018, STEP_Y + 0.03, z, 0.01, 0.012), C.cromo, 0.6);
    }
  };
  patines(1);

  /* --- ménsula del extremo izquierdo: misma altura que el bloque derecho, ~70% del ancho --- */
  const mx = -L - 0.24, mz = Dz * 0.7;
  add(body, box(mx, STEP_Y - 0.015, -mz, -L, STEP_Y, mz), C.blanco);            // plancha
  add(body, box(mx, STEP_Y - 0.06, -mz, mx + 0.015, STEP_Y - 0.015, mz), C.blanco); // pestaña frontal
  for (const z of [-mz + 0.008, mz - 0.008])                                         // cartelas
    add(body, extrude([[-L, STEP_Y - 0.26], [-L, STEP_Y - 0.015], [mx + 0.015, STEP_Y - 0.015], [mx + 0.015, STEP_Y - 0.06]], z - 0.007, z + 0.007, (u, v, w) => [u, v, w]), C.blanco);
  patines(-1);

  /* --- interior: paredes internas con U y cuna de barras --- */
  const innerEnd = [
    [0.33, 0.16], [0.33, 0.78], [0.24, 0.86], [0.2, 0.86], [0.2, 0.52],
    ...arc(0, 0.52, 0.2, 0, -Math.PI, 16).slice(1, -1),
    [-0.2, 0.52], [-0.2, 0.86], [-0.24, 0.86], [-0.33, 0.78], [-0.33, 0.16],
  ];
  for (const s of [-1, 1]) {
    const x = s * 0.6;
    add(body, extrude(innerEnd, x - 0.01, x + 0.01, YZ), C.interior);
  }
  for (const s of [-1, 1]) {
    const z = s * 0.3;
    add(body, box(-0.59, 0.76, z - 0.012, 0.59, 0.8, z + 0.012), C.cuna);   // larguero superior
    add(body, box(-0.59, 0.26, z - 0.012, 0.59, 0.3, z + 0.012), C.cuna);   // larguero inferior
    for (let i = 0; i < 11; i++) {
      const x = -0.52 + i * 0.104;
      add(body, box(x - 0.016, 0.3, z - 0.008, x + 0.016, 0.76, z + 0.008), C.cuna); // barras verticales
    }
  }
  for (let i = 0; i < 7; i++) {
    const x = -0.48 + i * 0.16;
    add(body, box(x - 0.02, 0.26, -0.3, x + 0.02, 0.3, 0.3), C.cuna); // travesaños del fondo
  }

  /* --- trabas del frente (fijas al cuerpo; el gancho va en la tapa) --- */
  for (const x of [-0.69, 0.69]) {
    add(body, box(x - 0.028, YS - 0.1, Dz, x + 0.028, YS - 0.01, Dz + 0.012), C.cromo, 0.6);
    add(body, box(x - 0.012, YS - 0.24, Dz + 0.02, x + 0.012, YS - 0.05, Dz + 0.04), C.rojo, 0.2);
    add(body, box(x - 0.016, YS - 0.07, Dz + 0.008, x + 0.016, YS - 0.02, Dz + 0.03), C.cromo, 0.6);
  }

  /* --- bisagras: bloques fijos al cuerpo --- */
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? L : -L - 0.04;
    add(body, box(x0, PIV[0] - 0.03, PIV[1] - 0.03, x0 + 0.04, PIV[0] + 0.03, PIV[1] + 0.03), C.blanco);
    add(body, box(x0, PIV[0] - 0.12, -Dz - 0.005, x0 + 0.04, PIV[0], -Dz + 0.03), C.blanco); // escuadra al cuerpo
  }

  /* =============== tapa (se arma cerrada; luego rota sobre PIV) =============== */
  add(lid, box(-L, YT - T, -Dz, L, YT, Dz), C.blanco);                  // techo
  add(lid, box(-L, YS, Dz - T, L, YT - T, Dz), C.blanco);               // frente
  add(lid, box(-L, YS, -Dz, L, YT - T, -Dz + T), C.blanco);             // atrás
  add(lid, box(-L + T, YT - T - 0.006, -Dz + T, L - T, YT - T, Dz - T), C.interior);
  add(lid, box(-L + T, YS, Dz - T - 0.006, L - T, YT - T, Dz - T), C.interior);
  add(lid, box(-L + T, YS, -Dz + T, L - T, YT - T, -Dz + T + 0.006), C.interior);
  // refuerzos internos del techo (cruz)
  add(lid, box(-0.012, YT - 0.06, -Dz + T, 0.012, YT - T, Dz - T), C.interior);
  add(lid, box(-L + T, YT - 0.06, -0.012, L - T, YT - T, 0.012), C.interior);

  // placas de extremo de la tapa: apoyo recto, salvo el saliente con el semicírculo superior del orificio
  const lidEnd = [
    [Dz, YS], [Dz, YT], [-Dz, YT], [-Dz, YS], [-W_T, YS], [-W_B, YC], [-R_H, YC],
    ...arc(0, YC, R_H, Math.PI, 0, 14).slice(1, -1),
    [R_H, YC], [W_B, YC], [W_T, YS],
  ];
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? L - T : -L, x1 = x0 + T;
    add(lid, extrude(lidEnd, x0, x1, YZ), C.blanco);
    // brazo de bisagra (sale del pivote y se fija a la placa)
    const xb = s > 0 ? L : -L - 0.012;
    add(lid, extrude([[PIV[1] - 0.025, PIV[0]], [PIV[1] + 0.02, PIV[0] - 0.02], [-0.24, 1.07], [-0.25, 1.12], [PIV[1] - 0.02, PIV[0] + 0.03]], xb, xb + 0.012, YZ), C.blanco);
  }
  // manijas del frente de la tapa
  for (const x of [-0.48, 0.37]) {
    const yh = (YS + YT) / 2;
    add(lid, box(x - 0.1, yh - 0.012, Dz + 0.045, x + 0.1, yh + 0.012, Dz + 0.07), C.blanco, 0.2);
    for (const e of [-1, 1]) add(lid, box(x + e * 0.1 - 0.014, yh - 0.022, Dz, x + e * 0.1 + 0.014, yh + 0.022, Dz + 0.07), C.blanco, 0.2);
    for (const e of [-1, 1]) add(lid, box(x + e * 0.13 - 0.02, yh - 0.027, Dz, x + e * 0.13 + 0.02, yh + 0.027, Dz + 0.006), C.cromo, 0.4);
  }
  // ganchos de las trabas (en la tapa)
  for (const x of [-0.69, 0.69]) add(lid, box(x - 0.02, YS, Dz, x + 0.02, YS + 0.06, Dz + 0.012), C.cromo, 0.6);
  // pernos sobre el techo
  for (const x of [-0.15, 0.18, 0.52]) add(lid, cylY(x, YT, 0.1, 0.008, 0.06, 10), C.cromo, 0.5);

  /* --- amortiguadores a gas (uno en cada extremo) con sus soportes --- */
  const struts = [];
  for (const s of [-1, 1]) {
    const xs = s * (L + 0.035);
    const a = [xs, 0.86, -0.36];  // anclaje en el cuerpo
    const b = [xs, 1.08, -0.12];  // anclaje en la tapa (posición con tapa cerrada)
    struts.push({ a, b });
    const xo = s > 0 ? L : -L - 0.045;
    add(body, box(xo, a[1] - 0.025, a[2] - 0.025, xo + 0.045, a[1] + 0.025, a[2] + 0.025), C.blanco); // soporte en el cuerpo
    add(lid, box(xo, b[1] - 0.03, b[2] - 0.025, xo + 0.045, b[1] + 0.03, b[2] + 0.025), C.blanco);    // soporte en la tapa
    add(lid, box(xs - 0.012, b[1] - 0.012, b[2] - 0.012, xs + 0.012, b[1] + 0.012, b[2] + 0.012), C.cromo, 0.6); // rótula
  }

  return { body, lid, struts };
}

/* ----------------------------------------------------------- WebGL setup */
const VS = `
attribute vec3 p; attribute vec3 n;
uniform mat4 uM, uVP; uniform mat3 uN;
varying vec3 vN; varying vec3 vW;
void main(){ vec4 w = uM*vec4(p,1.); vW=w.xyz; vN=normalize(uN*n); gl_Position=uVP*w; }`;
const FS = `
precision mediump float;
varying vec3 vN; varying vec3 vW;
uniform vec3 uC, uEye; uniform float uS;
void main(){
  vec3 n = normalize(vN); vec3 v = normalize(uEye - vW);
  if (dot(n,v) < 0.) n = -n;
  vec3 L1 = normalize(vec3(0.55, 0.9, 0.7)), L2 = normalize(vec3(-0.7, 0.35, 0.4));
  float hemi = 0.5 + 0.5*n.y;
  vec3 amb = mix(vec3(0.62,0.64,0.67), vec3(1.0), hemi) * 0.62;
  float d = max(dot(n,L1),0.)*0.5 + max(dot(n,L2),0.)*0.18;
  float sp = pow(max(dot(n, normalize(L1+v)),0.), 40.) * uS;
  gl_FragColor = vec4(uC*(amb+d) + sp, 1.);
}`;
const LVS = `attribute vec3 p; uniform mat4 uM, uVP; void main(){ gl_Position = uVP*uM*vec4(p,1.); gl_Position.z -= 0.00006*gl_Position.w; }`;
const LFS = `precision mediump float; uniform vec4 uC; void main(){ gl_FragColor = uC; }`;
const SVS = `attribute vec2 p; uniform mat4 uVP; uniform vec4 uR; varying vec2 q; void main(){ q=p; gl_Position = uVP*vec4(uR.x + p.x*uR.z, 0.001, uR.y + p.y*uR.w, 1.); }`;
const SFS = `precision mediump float; varying vec2 q; uniform float uA; void main(){ float d = length(q); gl_FragColor = vec4(0.12,0.14,0.17, uA*smoothstep(1.,0.,d)*smoothstep(1.,0.25,d)); }`;

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  const loc = (n) => gl.getUniformLocation(p, n);
  return { p, loc, a: (n) => gl.getAttribLocation(p, n) };
}

// Sube una geometría: triángulos con normales planas + aristas "marcadas" (bordes y quiebres > 25°)
function upload(gl, tris) {
  const data = new Float32Array(tris.length * 18);
  const edges = new Map();
  const key = (p) => p.map((v) => Math.round(v * 1e4)).join(",");
  tris.forEach((t, i) => {
    const [a, b, c] = t;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
    t.forEach((p, j) => data.set([...p, ...n], i * 18 + j * 6));
    for (let j = 0; j < 3; j++) {
      const p = t[j], q = t[(j + 1) % 3];
      const kp = key(p), kq = key(q), k = kp < kq ? kp + "|" + kq : kq + "|" + kp;
      const e = edges.get(k) || { p, q, n: [] };
      e.n.push(n); edges.set(k, e);
    }
  });
  const lines = [];
  for (const e of edges.values()) {
    let sharp = e.n.length === 1;
    if (!sharp) {
      for (let i = 1; i < e.n.length && !sharp; i++) {
        const d = e.n[0][0] * e.n[i][0] + e.n[0][1] * e.n[i][1] + e.n[0][2] * e.n[i][2];
        if (d < 0.9) sharp = true;
      }
    }
    if (sharp) lines.push(...e.p, ...e.q);
  }
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const lb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW);
  return { vb, n: tris.length * 3, lb, ln: lines.length / 3 };
}

// Junta varias piezas del mismo color en un solo buffer
function batch(parts) {
  const groups = new Map();
  for (const p of parts) {
    const k = p.color.join() + "|" + p.spec;
    if (!groups.has(k)) groups.set(k, { color: p.color, spec: p.spec, geo: [] });
    groups.get(k).geo.push(...p.geo);
  }
  return [...groups.values()];
}

/* ------------------------------------------------------------- component */
const CSS = `
:host { display:block; position:relative; height:480px; background:var(--h3d-bg,#e6eaed); border-radius:inherit;
  --ui: var(--h3d-ui,#1d2125); --acc: var(--h3d-accent,#e4572e); font-family: system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; user-select:none; }
canvas { width:100%; height:100%; display:block; touch-action:none; cursor:grab; outline:none; }
canvas:active { cursor:grabbing; }
:host([fachada]) canvas { touch-action:pan-y; }
.bar { position:absolute; left:50%; bottom:14px; transform:translateX(-50%); display:flex; gap:6px; align-items:center;
  background:rgba(255,255,255,.82); backdrop-filter:blur(8px); padding:6px; border-radius:12px; box-shadow:0 2px 10px rgba(0,0,0,.08); }
button { border:0; font:inherit; font-size:13px; font-weight:600; color:var(--ui); background:transparent; padding:8px 12px; border-radius:8px; cursor:pointer; white-space:nowrap; }
button:hover { background:rgba(0,0,0,.06); }
button.main { background:var(--acc); color:#fff; }
button.main:hover { filter:brightness(1.06); background:var(--acc); }
button.ic { width:34px; padding:8px 0; font-size:16px; line-height:1; }
.info { position:absolute; left:14px; top:12px; right:14px; pointer-events:none; font-size:12px; line-height:1.5; color:rgba(29,33,37,.62); }
.hint { transition:opacity .4s; }
.hint.off { opacity:0; }
.note { font-size:11px; color:rgba(29,33,37,.42); }
@media (max-width:520px){ .info{ font-size:11px; } .bar{ bottom:10px; } button{ padding:7px 9px; font-size:12px; } button.ic{ width:30px; } }
.err { position:absolute; inset:0; display:grid; place-items:center; color:var(--ui); font-size:14px; padding:20px; text-align:center; }
`;

class Horno3D extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.az = 0.42; this.el = 0.34; this.dist = 3.6;
    this.ang = 0; this.target = 0; this.OPEN = (105 * Math.PI) / 180;
    this.pointers = new Map();
  }

  connectedCallback() {
    if (this._init) return; this._init = true;
    const fach = (this.fachada = this.hasAttribute("fachada"));
    const ui = this.hasAttribute("sin-ui") ? "" : fach ? `
      <div class="bar"><button class="main" data-a="tapa">Abrir tapa</button></div>` : `
      <div class="bar">
        <button class="main" data-a="tapa">Abrir tapa</button>
        <button class="ic" data-a="out" aria-label="Alejar">−</button>
        <button class="ic" data-a="in" aria-label="Acercar">+</button>
        <button data-a="reset">Vista inicial</button>
      </div>`;
    this.shadowRoot.innerHTML = `<style>${CSS}</style><canvas tabindex="0" aria-label="Vista 3D del horno rotativo"></canvas>
      <div class="info"><div class="note">Modelo ilustrativo · proporciones aproximadas</div>
      <div class="hint">${fach ? "Arrastrá para girar" : "Arrastrá para girar · rueda o pellizco para zoom"}</div></div>${ui}`;
    this.canvas = this.shadowRoot.querySelector("canvas");
    const gl = this.canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) { this.shadowRoot.innerHTML += `<div class="err">Tu navegador no soporta WebGL.</div>`; return; }
    this.gl = gl;
    this.setup();
    this.bind();
    if (this.hasAttribute("abierto")) { this.ang = this.target = this.OPEN; }
    this.updateBtn();
    this.ro = new ResizeObserver(() => this.draw()); this.ro.observe(this);
    this.visible = true;
    this.io = new IntersectionObserver((es) => { this.visible = es[es.length - 1].isIntersecting; });
    this.io.observe(this);
    this.idleSince = performance.now();
    this.loop();
  }
  disconnectedCallback() { cancelAnimationFrame(this.raf); this.ro?.disconnect(); this.io?.disconnect(); this._init = false; }

  setup() {
    const gl = this.gl;
    this.prog = program(gl, VS, FS);
    this.lprog = program(gl, LVS, LFS);
    this.sprog = program(gl, SVS, SFS);
    const m = buildModel();
    this.body = batch(m.body).map((g) => ({ ...g, buf: upload(gl, g.geo) }));
    this.lid = batch(m.lid).map((g) => ({ ...g, buf: upload(gl, g.geo) }));
    this.struts = m.struts;
    this.cyl = upload(gl, cylinder(14));
    this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
  }

  bind() {
    const c = this.canvas;
    const hint = this.shadowRoot.querySelector(".hint");
    c.addEventListener("pointerdown", (e) => { this.idleSince = Infinity; c.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, [e.clientX, e.clientY]); hint.classList.add("off"); });
    c.addEventListener("pointermove", (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const prev = this.pointers.get(e.pointerId);
      if (this.pointers.size === 1) {
        this.az -= (e.clientX - prev[0]) * 0.006;
        this.el += (e.clientY - prev[1]) * 0.004;
      } else if (this.pointers.size === 2 && !this.fachada) {
        const [o] = [...this.pointers].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
        const d0 = Math.hypot(prev[0] - o[0], prev[1] - o[1]), d1 = Math.hypot(e.clientX - o[0], e.clientY - o[1]);
        if (d0 > 0) this.dist *= d0 / d1;
      }
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      this.clamp();
    });
    const up = (e) => { this.pointers.delete(e.pointerId); if (!this.pointers.size) this.idleSince = performance.now(); };
    c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
    if (!this.fachada) c.addEventListener("wheel", (e) => { e.preventDefault(); this.dist *= Math.exp(e.deltaY * 0.0012); this.clamp(); hint.classList.add("off"); }, { passive: false });
    c.addEventListener("dblclick", () => this.alternar());
    c.addEventListener("keydown", (e) => {
      const k = { ArrowLeft: () => (this.az += 0.08), ArrowRight: () => (this.az -= 0.08), ArrowUp: () => (this.el += 0.05), ArrowDown: () => (this.el -= 0.05), "+": () => { if (!this.fachada) this.dist *= 0.9; }, "-": () => { if (!this.fachada) this.dist *= 1.1; }, " ": () => this.alternar() }[e.key];
      if (k) { e.preventDefault(); k(); this.clamp(); }
    });
    this.shadowRoot.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      ({ tapa: () => this.alternar(), in: () => (this.dist *= 0.85), out: () => (this.dist /= 0.85), reset: () => this.vistaInicial() })[b.dataset.a]();
      this.clamp();
    }));
  }

  clamp() {
    // sin vista trasera: el giro queda limitado al frente y los laterales
    this.az = Math.max(-1.0, Math.min(1.15, this.az));
    this.el = Math.max(0.08, Math.min(0.85, this.el));
    this.dist = Math.max(1.6, Math.min(6, this.dist));
  }

  abrir() { this.target = this.OPEN; this.updateBtn(); }
  cerrar() { this.target = 0; this.updateBtn(); }
  alternar() { this.target ? this.cerrar() : this.abrir(); }
  vistaInicial() { this.az = 0.42; this.el = 0.34; this.dist = 3.6; }
  updateBtn() {
    const b = this.shadowRoot.querySelector('[data-a="tapa"]');
    if (b) b.textContent = this.target ? "Cerrar tapa" : "Abrir tapa";
    this.dispatchEvent(new CustomEvent("tapa", { detail: { abierta: !!this.target } }));
  }

  loop() {
    const step = (now) => {
      this.raf = requestAnimationFrame(step);
      if (!this.visible) return;
      // modo fachada: balanceo lento mientras nadie lo toca
      if (this.fachada && !this.pointers.size && now - this.idleSince > 2500) {
        const goal = 0.42 + 0.34 * Math.sin((now - this.idleSince - 2500) / 4200);
        this.az += (goal - this.az) * 0.02;
        this.el += (0.34 - this.el) * 0.02;
      }
      const d = this.target - this.ang;
      if (Math.abs(d) > 1e-4) this.ang += d * 0.085; else this.ang = this.target;
      this.draw();
    };
    this.raf = requestAnimationFrame(step);
  }

  draw() {
    const gl = this.gl, c = this.canvas;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    // cámara: orbita alrededor del centro del equipo; con la tapa abierta el centro sube un poco
    const open = this.ang / this.OPEN;
    const tgt = [0.28, 0.52 + open * 0.26, -open * 0.12];
    const asp = w / h;
    const dist = this.dist * Math.max(1.06, 1.25 / asp) * (1 + open * 0.3);
    const eye = [tgt[0] + dist * Math.sin(this.az) * Math.cos(this.el), tgt[1] + dist * Math.sin(this.el), tgt[2] + dist * Math.cos(this.az) * Math.cos(this.el)];
    const VP = M.mul(M.persp(0.62, asp, 0.05, 50), M.look(eye, tgt, [0, 1, 0]));

    // sombra de contacto
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    const sp = this.sprog; gl.useProgram(sp.p);
    gl.uniformMatrix4fv(sp.loc("uVP"), false, VP);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    const ap = sp.a("p"); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4f(sp.loc("uR"), 0.28, 0, 1.45, 0.75); gl.uniform1f(sp.loc("uA"), 0.38); gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.uniform4f(sp.loc("uR"), 0.28, 0, 1.0, 0.5); gl.uniform1f(sp.loc("uA"), 0.32); gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(ap);
    gl.depthMask(true); gl.disable(gl.BLEND);

    const I = M.id();
    const lidM = M.mul(M.t(0, PIV[0], PIV[1]), M.mul(M.rx(-this.ang), M.t(0, -PIV[0], -PIV[1])));

    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 2);
    const p = this.prog; gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.loc("uVP"), false, VP);
    gl.uniform3fv(p.loc("uEye"), eye);
    const drawMesh = (buf, model, color, spec) => {
      gl.uniformMatrix4fv(p.loc("uM"), false, model);
      gl.uniformMatrix3fv(p.loc("uN"), false, M.nmat(model));
      gl.uniform3fv(p.loc("uC"), color); gl.uniform1f(p.loc("uS"), spec);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.vb);
      const a = p.a("p"), n = p.a("n");
      gl.enableVertexAttribArray(a); gl.enableVertexAttribArray(n);
      gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(n, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, buf.n);
    };
    for (const g of this.body) drawMesh(g.buf, I, g.color, g.spec);
    for (const g of this.lid) drawMesh(g.buf, lidM, g.color, g.spec);

    // amortiguador: cuerpo (tubo negro) + vástago (cromo) entre anclajes
    const seg = (P, Q, r) => {
      const d = [Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]], len = Math.hypot(...d), y = d.map((v) => v / len);
      let x = Math.abs(y[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
      const zl = Math.hypot(...z); z.forEach((v, i) => (z[i] = v / zl));
      x = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]];
      return [x[0] * r, x[1] * r, x[2] * r, 0, y[0] * len, y[1] * len, y[2] * len, 0, z[0] * r, z[1] * r, z[2] * r, 0, P[0], P[1], P[2], 1];
    };
    for (const st of this.struts) {
      const A = st.a, B = M.apply(lidM, st.b);
      const dir = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], dl = Math.hypot(...dir);
      const mid = A.map((v, i) => v + (dir[i] / dl) * Math.min(0.24, dl * 0.7));
      drawMesh(this.cyl, seg(A, mid, 0.014), C.negro, 0.35);
      drawMesh(this.cyl, seg(A, B, 0.006), C.cromo, 0.6);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);

    // aristas
    const lp = this.lprog; gl.useProgram(lp.p);
    gl.uniformMatrix4fv(lp.loc("uVP"), false, VP);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform4f(lp.loc("uC"), 0.35, 0.38, 0.42, 0.42);
    const drawLines = (buf, model) => {
      if (!buf.ln) return;
      gl.uniformMatrix4fv(lp.loc("uM"), false, model);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.lb);
      const a = lp.a("p"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, buf.ln);
    };
    for (const g of this.body) drawLines(g.buf, I);
    for (const g of this.lid) drawLines(g.buf, lidM);
    gl.disable(gl.BLEND);
    // deja disponibles los atributos de normales apagados para el siguiente frame
    gl.disableVertexAttribArray(p.a("n"));
  }
}

if (!customElements.get("horno-3d")) customElements.define("horno-3d", Horno3D);
})();
