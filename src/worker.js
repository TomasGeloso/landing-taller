// Worker de Mecalab.
// Sirve el sitio estático (env.ASSETS) y atiende /api/*.
// El formulario de cotización (/api/cotizar) se implementa en el próximo paso.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/cotizar') {
      return new Response(JSON.stringify({ ok: false, error: 'No implementado todavía' }), {
        status: 501,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
