(function () {
  var T = '#1E5B8C';
  var GAL = window.TRABAJOS || [];
  var slug = function (s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'trabajo'; };
  GAL.forEach(function (g) { if (!g.id) g.id = slug(g.t); }); // si falta el identificador, se arma con el título
  var CT = window.CONTENIDO || {};   // secciones de la página (js/contenido.js)
  var TX = window.TEXTOS || {};      // textos modificados (js/textos.js)
  var gi = function (id) { for (var j = 0; j < GAL.length; j++) if (GAL[j].id === id) return j; return -1; };     // posición de un trabajo por id
  var fp = function (path) { for (var j = 0; j < GAL.length; j++) for (var k = 0; k < GAL[j].p.length; k++) if (GAL[j].p[k][0] === path) return { i: j, k: k }; return null; }; // trabajo y foto por archivo
  var N = 6;
  var SEG = N - 0.4; // tramos de scroll: el último servicio dura menos y no queda un hueco al final
  var state = { mode: 'tabs', vh: window.innerHeight, tab: 0, ri: 0, cat: 'todos', showAll: false, lb: null, lp: 0 };
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, attrs, html) { var e = document.createElement(tag); for (var k in (attrs || {})) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var th = function (src) { return src.replace(/^img\/trabajos\//, 'img/miniaturas/'); }; // miniatura de cada foto
  var each = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };

  /* ---------- Datos del taller (config.js) ---------- */
  var C = window.TALLER || {};
  var trim = function (v) { return (v == null ? '' : String(v)).trim(); };
  var waNum = trim(C.whatsapp).replace(/\D/g, '');
  var vals = {
    nombre: trim(C.nombre) || 'Mecalab', razonSocial: trim(C.razonSocial) || 'David Annessi Mecanizados', ciudad: trim(C.ciudad), telefono: trim(C.telefono), email: trim(C.email),
    direccion: trim(C.direccion), horario: trim(C.horario), horasRespuesta: trim(C.horasRespuesta), zona: trim(C.zona),
    ciudadProvincia: [trim(C.ciudad), trim(C.provincia)].filter(Boolean).join(', '),
    whatsappVisible: trim(C.whatsappVisible) || trim(C.telefono) || (waNum ? '+' + waNum : '')
  };
  each('[data-cfg]', function (e) { var v = vals[e.getAttribute('data-cfg')]; if (v) { e.textContent = v; e.classList.remove('tbd'); } });
  each('[data-cfg-href]', function (e) {
    var k = e.getAttribute('data-cfg-href');
    if (k === 'tel' && vals.telefono) e.href = 'tel:' + vals.telefono.replace(/[^\d+]/g, '');
    if (k === 'mail' && vals.email) e.href = 'mailto:' + vals.email;
  });
  var waLink = function (msg) { return 'https://wa.me/' + waNum + (msg ? '?text=' + encodeURIComponent(msg) : ''); };
  if (waNum) each('[data-wa]', function (e) { e.href = waLink(e.getAttribute('data-wa')); });
  each('[data-year]', function (e) { e.textContent = new Date().getFullYear(); });
  each('[data-anios]', function (e) { // años de experiencia: año actual menos año de inicio (config.js)
    var desde = +C[e.getAttribute('data-anios') === 'oficio' ? 'anioInicio' : 'anioInicioLaboratorios'];
    if (desde > 1900) e.textContent = new Date().getFullYear() - desde;
  });
  document.title = vals.nombre + ' · Taller metalúrgico para laboratorios · ' + vals.razonSocial;

  /* ---------- Textos modificados desde la admin ---------- */
  each('[data-t]', function (e) {
    var v = TX[e.getAttribute('data-t')]; if (v == null || v === '') return;
    for (var n = e.lastChild; n; n = n.previousSibling) if (n.nodeType === 3 && n.textContent.trim()) { n.textContent = v; return; }
    if (!e.children.length) e.textContent = v;
  });

  /* ---------- Clientes ("Trabajamos para") ---------- */
  if (CT.clientes && CT.clientes.length) {
    var lg = $('logos'); if (lg) { lg.innerHTML = ''; CT.clientes.forEach(function (c) {
      lg.appendChild(el('div', { 'class': 'logo-card' }, '<img src="' + esc(c.img) + '" alt="' + esc(c.n) + '" style="max-height: ' + (+c.h || 60) + 'px">'));
    }); }
    var pc = $('pie-clientes'); if (pc) { each('#pie-clientes > span:not(.mono)', function (s) { s.parentNode.removeChild(s); }); CT.clientes.forEach(function (c) {
      pc.appendChild(el('span', {}, esc(c.c ? c.c + ' · ' + c.n : c.n)));
    }); }
  } else { each('#logos, #pie-clientes', function (e) { e.style.display = 'none'; }); }

  /* ---------- Oficios ---------- */
  var labels = ['Construcción de equipos', 'Reparación y restauración', 'Cortes y mecanizados', 'Soldaduras', 'Probetas de ensayo', 'Moldes y matrices'];
  var stepsBox = $('steps');
  var stepBtns = labels.map(function (l, i) {
    var b = el('button', { type: 'button', 'class': 'step', 'aria-pressed': 'false' }, '<span class="n">0' + (i + 1) + '</span><span class="l">' + l + '</span>');
    b.addEventListener('click', function () { goTo(i); });
    stepsBox.appendChild(b);
    return b;
  });
  var panels = Array.prototype.slice.call(document.querySelectorAll('.wpanel'));
  var track = $('track'), stick = $('stick');
  var shortL = ['Equipos', 'Reparación', 'Mecanizado', 'Soldadura', 'Probetas', 'Moldes'];
  var svcRow = $('svc-row');
  var svcBtns = shortL.map(function (l, i) {
    var b = el('button', { type: 'button', 'class': 'svc', 'aria-current': i === 0 ? 'true' : 'false' }, '<span class="n">0' + (i + 1) + '</span>' + l);
    b.addEventListener('click', function () { goTo(i); });
    svcRow.appendChild(b);
    return b;
  });
  var spyI = 0;
  function setSpy(i) {
    if (i === spyI) return;
    spyI = i;
    svcBtns.forEach(function (b, k) { b.setAttribute('aria-current', k === i ? 'true' : 'false'); });
    var b = svcBtns[i];
    try { svcRow.scrollTo({ left: b.offsetLeft - (svcRow.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' }); } catch (e) { svcRow.scrollLeft = b.offsetLeft; }
  }
  function spy() {
    var bar = $('svc-bar').getBoundingClientRect().bottom;
    var line = bar + Math.min(220, window.innerHeight * 0.3), cur = 0;
    panels.forEach(function (p, k) { if (p.getBoundingClientRect().top <= line) cur = k; });
    if (lockStack && Date.now() < lockStack.until) return;
    lockStack = null;
    setSpy(cur);
  }
  var lockStack = null;

  function setTab(i, force) {
    if (i === state.tab && !force) return;
    state.tab = i;
    stepBtns.forEach(function (b, k) { b.setAttribute('aria-pressed', k === i ? 'true' : 'false'); b.classList.toggle('past', k < i); });
    panels.forEach(function (p, k) {
      var on = k === i;
      p.classList.toggle('active', on);
      if (on && state.mode !== 'stack') { p.classList.remove('panel-anim'); void p.offsetWidth; p.classList.add('panel-anim'); }
    });
    if (state.mode !== 'scroll') $('prog').style.height = ((i + 1) / N * 100) + '%';
  }

  function measure() {
    var w = window.innerWidth, h = window.innerHeight;
    state.vh = h;
    state.mode = w < 960 ? 'stack' : (h < 1500 ? 'scroll' : 'tabs');
    document.body.className = 'mode-' + state.mode;
    var scroll = state.mode === 'scroll';
    var padTop = scroll ? Math.round(Math.max(40, Math.min(110, h * 0.1))) : 0;
    track.style.height = scroll ? Math.round(h + SEG * h * 0.75) + 'px' : 'auto';
    stick.style.position = scroll ? 'sticky' : 'relative';
    stick.style.top = '0';
    stick.style.height = scroll ? h + 'px' : 'auto';
    stick.style.paddingTop = padTop + 'px';
    $('scroll-hint').style.display = scroll ? 'block' : 'none';
    $('horno').style.height = (scroll ? Math.max(280, Math.min(460, h - padTop - 330)) : 440) + 'px';
    stick.style.setProperty('--vis-h', (scroll ? Math.max(260, Math.min(500, h - padTop - 320)) : 420) + 'px');
    $('ba-col').style.flexBasis = (scroll ? Math.max(240, Math.min(380, Math.round((h - padTop - 330) * 0.8))) : 380) + 'px';
    setTab(state.tab, true);
    onScroll();
  }

  function onScroll() {
    if (state.mode === 'stack') { spy(); return; }
    if (state.mode !== 'scroll') return;
    var r = track.getBoundingClientRect();
    var total = r.height - window.innerHeight;
    if (total <= 0) return;
    var p = Math.min(1, Math.max(0, -r.top / total));
    $('prog').style.height = Math.round(p * 100) + '%';
    var i = Math.min(N - 1, Math.floor(p * SEG));
    // mientras dura el desplazamiento iniciado por un clic, no se cambia de panel en el camino
    if (lock) {
      if (i === lock.i || Date.now() > lock.until) lock = null;
      else return;
    }
    setTab(i);
  }

  var lock = null;
  function goTo(i) {
    if (state.mode === 'stack') {
      var barH = $('svc-bar').offsetHeight;
      lockStack = { until: Date.now() + 1200 };
      setSpy(i);
      window.scrollTo({ top: window.scrollY + panels[i].getBoundingClientRect().top - barH - 16, behavior: 'smooth' });
      return;
    }
    if (state.mode === 'scroll') {
      var r = track.getBoundingClientRect();
      var total = r.height - window.innerHeight;
      lock = { i: i, until: Date.now() + 1600 };
      window.scrollTo({ top: window.scrollY + r.top + Math.min(1, (i + 0.5) / SEG) * total, behavior: 'smooth' });
    }
    setTab(i);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault(); var i = +a.getAttribute('data-go');
      if (state.mode === 'stack') { goTo(i); return; }
      window.scrollTo({ top: window.scrollY + track.getBoundingClientRect().top, behavior: 'auto' }); setTimeout(function () { goTo(i); }, 50);
    });
  });

  /* ---------- Antes / después ---------- */
  var first = function (g, r) { for (var k = 0; k < g.p.length; k++) if (g.p[k][1] === r) return g.p[k][0]; return null; };
  var RES = (CT.antesDespues || []).map(function (id) { var i = gi(id); return i < 0 ? null : { g: GAL[i], i: i }; })
    .filter(function (x) { return x && first(x.g, 'a') && first(x.g, 'd'); });
  if (!RES.length) $('ba-col').parentNode.style.display = 'none'; // sin trabajos con antes y después, se oculta el comparador
  var resBtns = RES.map(function (x, i) {
    var b = el('button', { type: 'button', 'class': 'thumb', 'aria-label': x.g.t, title: x.g.t, style: 'width:100%;height:auto;aspect-ratio:1/1' }, '<img src="' + th(first(x.g, 'd') || x.g.p[0][0]) + '" alt="">');
    b.addEventListener('click', function () { renderRes(i); });
    $('res-thumbs').appendChild(b);
    return b;
  });
  function setPos(v) { $('ba-d').style.clipPath = 'inset(0 0 0 ' + v + '%)'; $('ba-knob').style.left = v + '%'; $('ba-range').value = v; }
  function renderRes(i) {
    state.ri = i;
    var g = RES[i].g;
    $('ba-a').src = first(g, 'a'); $('ba-a').alt = g.t + ', antes';
    $('ba-d').src = first(g, 'd'); $('ba-d').alt = g.t + ', después';
    $('ba-name').textContent = g.t;
    $('ba-all').textContent = 'Ver todas las fotos (' + g.p.length + ')';
    resBtns.forEach(function (b, k) { b.style.borderColor = k === i ? T : 'transparent'; b.style.opacity = k === i ? 1 : 0.72; b.setAttribute('aria-pressed', k === i ? 'true' : 'false'); });
    setPos(50);
  }
  $('ba-range').addEventListener('input', function (e) { setPos(e.target.value); });
  $('ba-all').addEventListener('click', function () {
    if (!RES.length) return;
    state.cat = RES[state.ri].g.c; state.showAll = true; renderGallery();
    $('galeria').scrollIntoView({ behavior: 'smooth' });
    openLb(RES[state.ri].i);
  });

  /* ---------- Equipos -> galería ---------- */
  $('eq-n').textContent = 'Ver fotos de equipos (' + GAL.filter(function (g) { return g.c === 'equipos'; }).length + ')';
  $('see-eq').addEventListener('click', function () { state.cat = 'equipos'; state.showAll = false; renderGallery(); $('galeria').scrollIntoView({ behavior: 'smooth' }); });

  /* ---------- Proceso de mecanizado ---------- */
  var pasos = CT.proceso || [];
  pasos.forEach(function (d, k) {
    var hit = fp(d.f), i = hit ? hit.i : -1, pi = hit ? hit.k : 0;
    var li = document.createElement('li');
    var b = el('button', { type: 'button', 'class': 'pstep' + (k === pasos.length - 1 ? ' last' : ''), 'aria-label': 'Ver foto: ' + d.t },
      '<span class="pn mono">0' + (k + 1) + '<i></i></span><div class="photo">' + (hit ? '<img src="' + th(d.f) + '" alt="' + esc(d.t) + '" loading="lazy">' : '') + '</div>' +
      '<span style="display:flex;flex-direction:column;gap:2px"><strong style="font-size:16px">' + esc(d.t) + '</strong><span style="font-size:13px;line-height:1.4;color:#4E5D69">' + esc(d.d) + '</span></span>');
    b.addEventListener('click', function () { if (i < 0) return; openLb(i); state.lp = pi; renderLb(); });
    li.appendChild(b); $('proc').appendChild(li);
  });
  if (!pasos.length) $('proc').style.display = 'none';

  /* ---------- Mosaicos de fotos en los paneles ---------- */
  each('[data-mosaic]', function (box) {
    var n = 0;
    ((CT.mosaicos || {})[box.getAttribute('data-mosaic')] || []).forEach(function (path) {
      var hit = fp(path); if (!hit) return;
      var i = hit.i, pi = hit.k, src = path;
      var b = el('button', { type: 'button', 'aria-label': 'Ver fotos: ' + GAL[i].t },
        '<img src="' + (n === 0 ? src : th(src)) + '" alt="' + esc(GAL[i].t) + '" loading="lazy"><span>' + esc(GAL[i].t) + '</span>');
      b.addEventListener('click', function () { openLb(i); state.lp = pi; renderLb(); });
      box.appendChild(b); n++;
    });
    if (!n) box.style.display = 'none';
  });

  /* ---------- Galería ---------- */
  var FEAT = (CT.destacados || []).filter(function (id) { return gi(id) >= 0; }); // ids de los destacados
  var catName = { equipos: 'Equipo', restauraciones: 'Restauración', probetas: 'Probetas', dispositivos: 'Dispositivo', piezas: 'Piezas', moldes: 'Molde', estructuras: 'Estructura', taller: 'El taller' };
  var catDefs = [['todos', 'Todos'], ['equipos', 'Equipos'], ['restauraciones', 'Restauraciones'], ['probetas', 'Probetas'], ['dispositivos', 'Dispositivos'], ['piezas', 'Piezas'], ['moldes', 'Moldes y matrices'], ['estructuras', 'Estructuras'], ['taller', 'El taller']];
  var filterBtns = catDefs.map(function (c) {
    var n = c[0] === 'todos' ? GAL.length : GAL.filter(function (g) { return g.c === c[0]; }).length;
    var b = el('button', { type: 'button', 'class': 'filter', 'aria-pressed': 'false' }, esc(c[1]) + ' <span class="mono" style="font-size:12px;opacity:.7">' + n + '</span>');
    b.addEventListener('click', function () { state.cat = c[0]; state.showAll = false; renderGallery(); });
    $('filters').appendChild(b);
    return b;
  });
  var limit = function () { return window.innerWidth < 700 ? 12 : 18; };
  var LIMIT = limit();
  function renderGallery() {
    LIMIT = limit();
    filterBtns.forEach(function (b, k) { b.setAttribute('aria-pressed', catDefs[k][0] === state.cat ? 'true' : 'false'); });
    var todos = state.cat === 'todos';
    var fbox = $('feat'); fbox.innerHTML = ''; fbox.style.display = todos ? '' : 'none';
    if (todos) FEAT.forEach(function (id) {
      var i = gi(id);
      var g = GAL[i], d = first(g, 'd'), ab = !!first(g, 'a') && !!d;
      var b = el('button', { type: 'button', 'class': 'fcard', 'aria-label': 'Ver fotos: ' + g.t },
        '<img src="' + (d || g.p[0][0]) + '" alt="' + esc(g.t) + '" loading="lazy"><span class="fc"><span class="fk">' + catName[g.c] + (ab ? ' · antes y después' : '') + ' · ' + g.p.length + ' fotos</span><span class="ft">' + esc(g.t) + '</span></span>');
      b.addEventListener('click', function () { openLb(i); });
      fbox.appendChild(b);
    });
    var filtered = [];
    GAL.forEach(function (g, i) { if ((todos && FEAT.indexOf(g.id) < 0) || g.c === state.cat) filtered.push({ g: g, i: i }); });
    var visible = state.showAll ? filtered : filtered.slice(0, LIMIT);
    var box = $('cards'); box.innerHTML = '';
    visible.forEach(function (x) {
      var g = x.g, d = first(g, 'd'), ab = !!first(g, 'a') && !!d;
      var badge = ab ? '<span class="badge mono" style="background:' + T + '">ANTES / DESPUÉS</span>' : (g.p.length > 1 ? '<span class="badge mono" style="background:#16222B">' + g.p.length + ' FOTOS</span>' : '');
      var b = el('button', { type: 'button', 'class': 'gitem panel-anim', 'aria-label': 'Ver fotos: ' + g.t },
        '<div class="photo" style="position:relative;aspect-ratio:1/1"><img src="' + th(d || g.p[0][0]) + '" alt="' + esc(g.t) + '" loading="lazy">' + badge + '</div>' +
        '<span class="gt">' + esc(g.t) + '</span>');
      b.addEventListener('click', function () { openLb(x.i); });
      box.appendChild(b);
    });
    var more = $('more');
    if (!state.showAll && filtered.length > LIMIT) { more.style.display = 'inline-flex'; more.textContent = 'Ver ' + (filtered.length - LIMIT) + ' trabajos más'; }
    else more.style.display = 'none';
  }
  $('more').addEventListener('click', function () { state.showAll = true; renderGallery(); });

  /* ---------- Lightbox ---------- */
  var lastFocus = null;
  function openLb(i) { lastFocus = document.activeElement; state.lb = i; state.lp = 0; renderLb(); $('lb').classList.add('open'); $('lb-close').focus(); }
  function closeLb() { $('lb').classList.remove('open'); state.lb = null; if (lastFocus) lastFocus.focus(); }
  function renderLb() {
    var g = GAL[state.lb], n = g.p.length, ph = g.p[state.lp];
    $('lb-title').textContent = g.t;
    $('lb-pos').textContent = 'Foto ' + (state.lp + 1) + ' de ' + n;
    var img = $('lb-img'); img.src = ph[0]; img.alt = g.t + ', foto ' + (state.lp + 1);
    img.classList.remove('panel-anim'); void img.offsetWidth; img.classList.add('panel-anim');
    var role = $('lb-role');
    if (ph[1]) { role.style.display = 'block'; role.textContent = ph[1] === 'a' ? 'ANTES' : 'DESPUÉS'; role.style.background = ph[1] === 'a' ? '#16222B' : T; }
    else role.style.display = 'none';
    var tbox = $('lb-thumbs'); tbox.innerHTML = '';
    g.p.forEach(function (p, k) {
      var b = el('button', { type: 'button', 'class': 'lb-th', 'aria-label': 'Ver foto ' + (k + 1) }, '<img src="' + th(p[0]) + '" alt="">');
      b.style.borderColor = k === state.lp ? '#fff' : 'transparent';
      b.addEventListener('click', function () { state.lp = k; renderLb(); });
      tbox.appendChild(b);
    });
    var multi = n > 1;
    $('lb-prev').style.visibility = multi ? 'visible' : 'hidden';
    $('lb-next').style.visibility = multi ? 'visible' : 'hidden';
  }
  function step(d) { var n = GAL[state.lb].p.length; state.lp = (state.lp + d + n) % n; renderLb(); }
  $('lb-close').addEventListener('click', closeLb);
  $('lb-prev').addEventListener('click', function () { step(-1); });
  $('lb-next').addEventListener('click', function () { step(1); });
  $('lb').addEventListener('click', function (e) { if (e.target === $('lb')) closeLb(); });
  document.addEventListener('keydown', function (e) {
    if (state.lb == null) return;
    if (e.key === 'Escape') closeLb();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  /* ---------- Materiales: aparición al entrar en pantalla ---------- */
  var mats = Array.prototype.slice.call(document.querySelectorAll('.mat'));
  if (document.documentElement.classList.contains('js')) {
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var m = e.target, k = mats.indexOf(m);
          if (e.isIntersecting && e.intersectionRatio >= 0.45) {
            m.style.transitionDelay = (window.innerWidth > 1000 ? (k % 4) * 0.1 : window.innerWidth > 700 ? (k % 2) * 0.12 : 0) + 's';
            m.classList.add('in');
          } else if (!e.isIntersecting && m.classList.contains('in')) {
            // salió de pantalla: se rearma sin animar para volver a aparecer
            m.style.transition = 'none'; m.querySelector('.smp').style.transition = 'none';
            m.classList.remove('in');
            void m.offsetWidth;
            m.style.transition = ''; m.querySelector('.smp').style.transition = '';
          }
        });
      }, { threshold: [0, 0.45], rootMargin: '0px 0px -12% 0px' });
      mats.forEach(function (m) { io.observe(m); });
    } else mats.forEach(function (m) { m.classList.add('in'); });
  }

  /* ---------- Botones de consulta -> formulario ---------- */
  var form = $('quote');
  each('[data-tipo]', function (a) {
    a.addEventListener('click', function () {
      $('f-tipo').value = a.getAttribute('data-tipo');
      form.classList.remove('flash'); void form.offsetWidth; form.classList.add('flash');
      setTimeout(function () { form.classList.remove('flash'); try { $('f-nombre').focus({ preventScroll: true }); } catch (e) {} }, 900);
    });
  });

  /* ---------- Formulario ---------- */
  var msgBox = $('form-msg');
  function msg(text, err) { msgBox.textContent = text; msgBox.className = 'form-msg show' + (err ? ' err' : ''); }
  function showSent() { form.style.display = 'none'; $('sent').style.display = 'flex'; }
  if (/[?&]enviado=1/.test(location.search)) showSent();
  $('sent-again').addEventListener('click', function () { $('sent').style.display = 'none'; form.style.display = 'grid'; form.reset(); });
  form.addEventListener('submit', function (e) {
    msgBox.className = 'form-msg';
    if (!form.checkValidity()) {
      e.preventDefault();
      var bad = form.querySelector(':invalid');
      msg('Revisá los campos marcados con * antes de enviar.', true);
      if (bad) bad.focus();
      return;
    }
    e.preventDefault();
    var btn = $('send');
    btn.disabled = true; btn.textContent = 'Enviando…';
    var fin = function () { btn.disabled = false; btn.textContent = 'Enviar pedido'; if (window.turnstile) { try { turnstile.reset(); } catch (x) {} } };
    var fallo = function (texto) {
      fin();
      msg(texto || 'No pudimos enviar tu pedido.', true);
      if (waNum) {
        msgBox.appendChild(document.createTextNode(' Podés escribirnos por '));
        var a = el('a', { href: waLink(armarWhatsApp()), target: '_blank', rel: 'noopener' }, 'WhatsApp');
        msgBox.appendChild(a); msgBox.appendChild(document.createTextNode('.'));
      }
    };
    fetch('/api/cotizar', { method: 'POST', body: new FormData(form) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok && d.ok, error: d.error }; }); })
      .then(function (res) {
        if (!res.ok) return fallo(res.error);
        fin(); form.reset(); showSent();
      })
      .catch(function () { fallo('No pudimos conectarnos. Revisá tu conexión.'); });
  });
  function armarWhatsApp() {
    var f = function (id) { return $(id).value.trim(); };
    return 'Hola, quiero pedir una cotización.\n\n' +
      'Nombre: ' + f('f-nombre') + (f('f-empresa') ? '\nEmpresa: ' + f('f-empresa') : '') +
      '\nEmail: ' + f('f-email') + '\nWhatsApp: ' + f('f-wa') + '\nNecesito: ' + f('f-tipo') +
      (f('f-mat') ? '\nMaterial: ' + f('f-mat') : '') + (f('f-cant') ? '\nCantidad: ' + f('f-cant') : '') +
      (f('f-detalle') ? '\nDetalle: ' + f('f-detalle') : '') +
      ($('f-arch').files.length ? '\n\n(Tengo planos/fotos para enviarles por acá.)' : '');
  }

  /* ---------- Galería ampliada: deslizar en el celular ---------- */
  var tx = null;
  $('lb').addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
  $('lb').addEventListener('touchend', function (e) {
    if (tx == null || state.lb == null) return;
    var dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 50 && GAL[state.lb].p.length > 1) step(dx < 0 ? 1 : -1);
  });

  /* ---------- Inicio ---------- */
  if (RES.length) renderRes(0);
  renderGallery();
  window.addEventListener('resize', function () { measure(); if (limit() !== LIMIT) renderGallery(); });
  window.addEventListener('scroll', onScroll, { passive: true });
  measure();
})();
