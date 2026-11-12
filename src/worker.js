// Worker de Mecalab.
// Sirve el sitio estático (env.ASSETS) y atiende /api/cotizar.
//
// Necesita en Cloudflare:
//   - Secreto  TURNSTILE_SECRET  (Settings > Variables and Secrets)
//   - Bucket R2 conectado como   ADJUNTOS  (ver wrangler.jsonc)
//
// Cada pedido se guarda en R2 como  pedidos/<id>/pedido.json  y sus archivos
// en  pedidos/<id>/<archivo>.  El aviso por email se agrega en el próximo paso.

const MAX_ARCHIVOS = 5;
const MAX_BYTES_ARCHIVO = 10 * 1024 * 1024;  // 10 MB por archivo
const MAX_BYTES_TOTAL = 25 * 1024 * 1024;    // 25 MB por pedido
const EXT_PERMITIDAS = ['pdf', 'dwg', 'dxf', 'step', 'stp', 'iges', 'igs', 'jpg', 'jpeg', 'png', 'heic'];
const TIPOS = [
  'Construcción de un equipo',
  'Reparación o restauración de un equipo',
  'Corte o mecanizado',
  'Soldadura',
  'Probetas de ensayo',
  'Molde o matriz'
];

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function nombreSeguro(nombre) {
  const limpio = nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+/, '')
    .slice(-80);
  return limpio || 'archivo';
}

// Verifica el token de Turnstile: éxito, acción esperada y que se haya generado
// en este mismo sitio (hostname). Ante cualquier error responde "no verificado".
async function verificarTurnstile(token, ip, hostname, env) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const datos = new FormData();
  datos.append('secret', env.TURNSTILE_SECRET);
  datos.append('response', token);
  if (ip) datos.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: datos, signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) return false;
    const res = await r.json();
    return res.success === true && res.action === 'cotizar' && res.hostname === hostname;
  } catch {
    return false;
  }
}

async function cotizar(request, env) {
  if (request.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);
  if (!env.TURNSTILE_SECRET || !env.ADJUNTOS) {
    console.error('Falta TURNSTILE_SECRET o el bucket ADJUNTOS');
    return json({ ok: false, error: 'El formulario no está configurado' }, 500);
  }

  // Corte temprano: un pedido legítimo nunca supera los 25 MB de archivos más unos KB de texto.
  const declarado = parseInt(request.headers.get('content-length') || '0', 10);
  if (declarado > MAX_BYTES_TOTAL + 1024 * 1024) return json({ ok: false, error: 'El pedido es demasiado grande.' }, 413);

  // Límite por IP (binding LIMITADOR). Si no está configurado, se omite.
  if (env.LIMITADOR) {
    const { success } = await env.LIMITADOR.limit({ key: request.headers.get('CF-Connecting-IP') || 'sin-ip' });
    if (!success) return json({ ok: false, error: 'Enviaste varios pedidos seguidos. Esperá un minuto y probá de nuevo.' }, 429);
  }

  let form;
  try { form = await request.formData(); } catch { return json({ ok: false, error: 'Pedido inválido' }, 400); }

  // Trampa para bots: este campo está oculto y una persona nunca lo completa.
  // Respondemos "ok" para no darles pistas, pero no guardamos nada.
  if (texto(form.get('_honey'), 100)) return json({ ok: true });

  const ip = request.headers.get('CF-Connecting-IP');
  const humano = await verificarTurnstile(form.get('cf-turnstile-response'), ip, new URL(request.url).hostname, env);
  if (!humano) return json({ ok: false, error: 'No pudimos verificar que no sos un robot. Probá de nuevo.' }, 403);

  const pedido = {
    nombre: texto(form.get('nombre'), 120),
    empresa: texto(form.get('empresa'), 120),
    email: texto(form.get('email'), 150),
    whatsapp: texto(form.get('whatsapp'), 40),
    tipo: texto(form.get('tipo'), 80),
    material: texto(form.get('material'), 120),
    cantidad: texto(form.get('cantidad'), 80),
    detalle: texto(form.get('detalle'), 4000)
  };
  if (!pedido.nombre || !pedido.whatsapp || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pedido.email) || !TIPOS.includes(pedido.tipo)) {
    return json({ ok: false, error: 'Revisá los campos obligatorios.' }, 400);
  }

  const archivos = form.getAll('archivos').filter((f) => typeof f !== 'string' && f.size > 0);
  if (archivos.length > MAX_ARCHIVOS) return json({ ok: false, error: `Podés adjuntar hasta ${MAX_ARCHIVOS} archivos.` }, 400);
  let total = 0;
  for (const f of archivos) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!EXT_PERMITIDAS.includes(ext)) return json({ ok: false, error: `Tipo de archivo no permitido: ${f.name}` }, 400);
    if (f.size > MAX_BYTES_ARCHIVO) return json({ ok: false, error: `${f.name} supera los 10 MB.` }, 400);
    total += f.size;
  }
  if (total > MAX_BYTES_TOTAL) return json({ ok: false, error: 'Los archivos superan los 25 MB en total.' }, 400);

  const id = crypto.randomUUID();
  const base = `pedidos/${id}/`;
  const adjuntos = [];
  try {
    for (const [i, f] of archivos.entries()) {
      const clave = `${base}${i + 1}-${nombreSeguro(f.name)}`;
      await env.ADJUNTOS.put(clave, f.stream(), {
        httpMetadata: { contentType: f.type || 'application/octet-stream', contentDisposition: 'attachment' }
      });
      adjuntos.push({ clave, nombre: f.name, bytes: f.size });
    }
    await env.ADJUNTOS.put(`${base}pedido.json`, JSON.stringify({ id, fecha: new Date().toISOString(), ...pedido, adjuntos }, null, 2), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' }
    });
  } catch (e) {
    console.error('Error guardando el pedido en R2', e);
    return json({ ok: false, error: 'No pudimos guardar tu pedido.' }, 500);
  }

  // TODO (próximo paso): enviar el aviso por email con los datos y el link a los adjuntos.
  return json({ ok: true, id });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/cotizar') return cotizar(request, env);
    return env.ASSETS.fetch(request);
  }
};
