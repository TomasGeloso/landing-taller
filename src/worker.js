// Worker de Annessi.
// Sirve el sitio estático (env.ASSETS) y atiende /api/cotizar.
//
// Necesita en Cloudflare:
//   - Secreto  TURNSTILE_SECRET  (Settings > Variables and Secrets)
//   - Binding  AVISOS            (send_email de Cloudflare: manda el aviso por email, sin servicios externos)
//   - Secreto  RESEND_API_KEY    (opcional: solo si se usa Resend en lugar del binding AVISOS)
//   - Secreto  EMAIL_AVISO       (casilla que recibe los pedidos)
//   - Variable EMAIL_REMITENTE   (opcional) quién figura como remitente del aviso, ej.:  Annessi <avisos@tudominio.ar>
//                                Hasta verificar el dominio en Resend se usa el remitente de prueba de Resend.
//   - Bucket R2 conectado como   ADJUNTOS  (ver wrangler.jsonc)
//
// Cada pedido se guarda en R2 como  pedidos/<id>/pedido.json  y sus archivos
// en  pedidos/<id>/<archivo>.  Después se avisa por email con el link a cada archivo.

const MAX_ARCHIVOS = 5;
const MAX_BYTES_ARCHIVO = 10 * 1024 * 1024;  // 10 MB por archivo
const MAX_BYTES_TOTAL = 25 * 1024 * 1024;    // 25 MB por pedido
const EXT_PERMITIDAS = ['pdf', 'dwg', 'dxf', 'step', 'stp', 'iges', 'igs', 'jpg', 'jpeg', 'png', 'heic'];

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
    tipo: texto(form.get('tipo'), 120),
    material: texto(form.get('material'), 120),
    cantidad: texto(form.get('cantidad'), 80),
    detalle: texto(form.get('detalle'), 4000)
  };
  // Requisitos mínimos: nombre, una forma de contacto (email o WhatsApp) y algo que diga qué necesita.
  const mailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pedido.email);
  const telOk = pedido.whatsapp.replace(/\D/g, '').length >= 6;
  const hayArchivos = form.getAll('archivos').some((f) => typeof f !== 'string' && f.size > 0);
  if (!pedido.nombre) return json({ ok: false, error: 'Escribí tu nombre.' }, 400);
  if (!mailOk && !telOk) return json({ ok: false, error: 'Dejanos un email o un WhatsApp válido para poder responderte.' }, 400);
  if (pedido.email && !mailOk) return json({ ok: false, error: 'Revisá el email.' }, 400);
  if (pedido.whatsapp && !telOk) return json({ ok: false, error: 'Revisá el número de WhatsApp o teléfono.' }, 400);
  if (!pedido.tipo && !pedido.detalle && !hayArchivos) return json({ ok: false, error: 'Contanos qué necesitás o adjuntá un archivo.' }, 400);

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

  // El pedido ya está guardado: si el aviso falla no se le muestra error a la persona.
  await avisarPorEmail(env, new URL(request.url).origin, id, pedido, adjuntos);
  return json({ ok: true, id });
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));


// ---- Envío por Cloudflare (binding send_email "AVISOS") ----
const b64 = (s) => { let bin = ''; new TextEncoder().encode(s).forEach((b) => { bin += String.fromCharCode(b); }); return btoa(bin); };
const b64Lineas = (s) => b64(s).replace(/.{1,76}/g, (x) => x + '\r\n').trim();
const limpio = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();
// Encabezado con acentos: palabras codificadas de a 15 caracteres (el límite es 75 por palabra)
function encabezadoUtf8(txt) {
  const t = limpio(txt);
  if (/^[\x20-\x7e]*$/.test(t)) return t;
  const letras = [...t], trozos = [];
  for (let i = 0; i < letras.length; i += 15) trozos.push('=?UTF-8?B?' + b64(letras.slice(i, i + 15).join('')) + '?=');
  return trozos.join('\r\n ');
}
function armarMime({ de, deNombre, para, responderA, asunto, text, html, dominio }) {
  const limite = 'annessi-' + crypto.randomUUID();
  const cab = [
    'From: ' + encabezadoUtf8(deNombre) + ' <' + de + '>',
    'To: ' + para,
    responderA ? 'Reply-To: ' + limpio(responderA) : null,
    'Subject: ' + encabezadoUtf8(asunto),
    'Date: ' + new Date().toUTCString(),
    'Message-ID: <' + crypto.randomUUID() + '@' + dominio + '>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + limite + '"'
  ].filter(Boolean).join('\r\n');
  const parte = (tipo, cuerpo) => '--' + limite + '\r\nContent-Type: ' + tipo + '; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + b64Lineas(cuerpo) + '\r\n';
  return cab + '\r\n\r\n' + parte('text/plain', text) + parte('text/html', html) + '--' + limite + '--\r\n';
}
async function enviarPorCloudflare(env, responderA, asunto, text, html) {
  // EMAIL_REMITENTE tiene la forma:  Annessi <avisos@annessi.ar>
  const m = String(env.EMAIL_REMITENTE || '').match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  const deNombre = m ? (m[1] || 'Annessi') : 'Annessi';
  const de = m ? m[2] : 'avisos@annessi.ar';
  const para = limpio(env.EMAIL_AVISO);
  const raw = armarMime({ de, deNombre, para, responderA, asunto, text, html, dominio: de.split('@')[1] });
  const { EmailMessage } = await import('cloudflare:email');  // solo se carga si se usa
  await env.AVISOS.send(new EmailMessage(de, para, raw));
}

// Aviso por email: con Cloudflare (binding AVISOS) o, si no está, con Resend (puente hasta tener el dominio propio con Email Routing).
// Necesita los secretos RESEND_API_KEY y EMAIL_AVISO (casilla que recibe los pedidos).
async function avisarPorEmail(env, origen, id, p, adjuntos) {
  if (!env.EMAIL_AVISO || (!env.AVISOS && !env.RESEND_API_KEY)) {
    console.error('Falta EMAIL_AVISO o el envío (binding AVISOS / RESEND_API_KEY): el pedido', id, 'quedó guardado sin aviso');
    return;
  }
  const links = adjuntos.map((a) => ({ nombre: a.nombre, url: `${origen}/api/adjunto/${id}/${a.clave.split('/').pop()}` }));
  const filas = [
    ['Nombre', p.nombre], ['Empresa', p.empresa], ['Email', p.email], ['WhatsApp', p.whatsapp],
    ['Necesita', p.tipo], ['Material', p.material], ['Cantidad', p.cantidad], ['Detalle', p.detalle]
  ].filter(([, v]) => v);
  const text = filas.map(([k, v]) => `${k}: ${v}`).join('\n') +
    (links.length ? '\n\nArchivos:\n' + links.map((l) => `${l.nombre}: ${l.url}`).join('\n') : '');
  const html = '<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif">' +
    filas.map(([k, v]) => `<tr><td style="vertical-align:top"><b>${esc(k)}</b></td><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join('') +
    '</table>' +
    (links.length ? '<p style="font-family:sans-serif"><b>Archivos:</b></p><ul>' +
      links.map((l) => `<li><a href="${esc(l.url)}">${esc(l.nombre)}</a></li>`).join('') + '</ul>' : '');
  if (env.AVISOS) {
    try { await enviarPorCloudflare(env, p.email, `Pedido de cotización: ${p.tipo || p.nombre}`, text, html); }
    catch (e) { console.error('No se pudo enviar el aviso por Cloudflare', e); }
    return;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_REMITENTE || 'Annessi <onboarding@resend.dev>',
        to: [env.EMAIL_AVISO],
        reply_to: p.email || undefined,
        subject: `Pedido de cotización: ${p.tipo || p.nombre}`,
        text, html
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) console.error('Resend respondió', r.status, await r.text());
  } catch (e) {
    console.error('No se pudo enviar el aviso por email', e);
  }
}

// Descarga de un adjunto. El link solo se conoce por el mail: el id del pedido
// es un UUID aleatorio imposible de adivinar. pedido.json no se sirve.
async function adjunto(request, env, id, archivo) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ ok: false, error: 'Método no permitido' }, 405);
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^\d-[a-zA-Z0-9._-]{1,90}$/.test(archivo)) return new Response('No encontrado', { status: 404 });
  const obj = await env.ADJUNTOS.get(`pedidos/${id}/${archivo}`);
  if (!obj) return new Response('No encontrado', { status: 404 });
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('content-disposition', `attachment; filename="${archivo.replace(/^\d-/, '')}"`);
  h.set('x-content-type-options', 'nosniff');
  h.set('x-robots-tag', 'noindex');
  h.set('cache-control', 'private, no-store');
  return new Response(request.method === 'HEAD' ? null : obj.body, { headers: h });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // www.annessi.ar redirige al dominio principal (una sola dirección para Google y para compartir)
    if (url.hostname === 'www.annessi.ar') return Response.redirect('https://annessi.ar' + url.pathname + url.search, 301);
    if (url.pathname === '/api/cotizar') return cotizar(request, env);
    const m = url.pathname.match(/^\/api\/adjunto\/([^/]+)\/([^/]+)$/);
    if (m) return adjunto(request, env, m[1], decodeURIComponent(m[2]));
    return env.ASSETS.fetch(request);
  }
};
