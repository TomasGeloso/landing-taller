# Barra superior fija — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una barra fija de un renglón (marca + cotizar; en PC también el menú) que aparece al bajar, sin tapar ni cortar contenido.

**Architecture:** Elemento nuevo `#barra` (position: fixed) que se muestra cuando la cabecera original `.hdr` sale de la vista (IntersectionObserver). Su alto se publica en la variable CSS `--barra-h` en `<html>`; CSS (scroll-padding, `#svc-bar`) y JS de Servicios (`#stick`, progreso, saltos) restan ese alto.

**Tech Stack:** HTML/CSS/JS sin dependencias; pruebas con Chrome headless por CDP desde Node 26.

**Spec:** `docs/superpowers/specs/2026-11-25-barra-fija-design.md`

## Global Constraints
- Arriba de todo la cabecera queda como hoy; la barra no existe visualmente hasta que `.hdr` sale de la vista.
- Celular (≤700 px): logo + "Cotizar". PC: logo + Servicios / Materiales / Galería + "Pedir cotización". Sin ☰.
- Orden de capas: `.skip` 100 > `.lb` 50 > `#barra` 40 > `.wa-float` 30 > `#svc-bar` 20.
- Con `prefers-reduced-motion: reduce`, sin animación de entrada.
- Tamaños de prueba: 360×640, 360×740, 390×844, 768×1024, 1280×720, 1366×657, 1366×768, 1440×900, 1536×864, 1920×1080.

## Review Focus
- Tipografías que llegan tarde (red lenta): un servicio que entraba con la letra provisoria queda cortado con la definitiva → se vuelve a medir con `document.fonts.ready` y `load`. Prueba: Task 1 y 3 corren también con las fuentes demoradas.
- Saltar desde el menú de la barra (Servicios en PC, modo scroll) deja el primer servicio debajo de la barra, no tapado. Prueba en Task 3.
- Abrir el visor de fotos con la barra visible: el visor queda por encima. Prueba en Task 2.
- Rotar/cambiar tamaño con la barra visible: el alto de `--barra-h` se actualiza (celular ↔ PC). Prueba en Task 3 (resize 390→1366).
- Volver arriba del todo: la barra se oculta y no queda tapando la cabecera original. Prueba en Task 2.

---

### Task 1: Verificador en Chrome y medición de base

**Files:**
- Create: `<scratchpad>/check/servir.mjs` (servidor estático en 127.0.0.1 de la carpeta del proyecto)
- Create: `<scratchpad>/check/verificar.mjs` (CDP; recibe `--fuentes-lentas` opcional)

**Interfaces:**
- Produces: `verificar.mjs` imprime, por tamaño, una línea JSON: `{tam, modo, barraH, cortes:[{panel, falta_px}], tapados:[{panel, px}], anclas:[{id, tapado_px}]}`.
  - `cortes`: en modo scroll, para cada panel activo, `panel.bottom − (stick.bottom − 8)` si es > 0.
  - `tapados`: en modo scroll, `barra.bottom − panel.top` si es > 0; en modo stack, al tocar cada botón de `#svc-row`, `svcBar.bottom − h3.top` si es > 0.
  - `anclas`: tras ir a `#trabajos`, `#materiales`, `#galeria`, `#cotizar`, `barra.bottom − h2.top` si es > 0.

- [ ] **Step 1:** Escribir ambos scripts (Write tool, no heredoc).
- [ ] **Step 2:** Correr contra el código actual, normal y con `--fuentes-lentas` (fuentes de Google demoradas 3 s con `Fetch.enable`). Esperado: `barraH: 0`; anotar modos y cortes de base.

### Task 2: La barra (HTML + CSS + mostrar/ocultar)

**Files:**
- Modify: `index.html` (después de `.skip`, antes de `#inicio`)
- Modify: `css/estilos.css` (bloque nuevo "barra fija" al final)
- Modify: `js/main.js` (bloque nuevo "Barra fija" antes de "Inicio")

**Interfaces:**
- Produces: `<header id="barra" class="barra" aria-hidden="true" inert>`; clase `on` cuando visible (y se quita `aria-hidden`/`inert`). Variable CSS `--barra-h` en `document.documentElement` (px, siempre el alto real aunque esté oculta). Función JS `barraH(): number`.

- [ ] **Step 1:** Agregar al verificador: a scroll 0 la barra no es visible (`transform` fuera de pantalla o `visibility:hidden`); a scroll = hero + 10 sí; con `#lb` abierto, `elementFromPoint` en el centro superior es del visor.
- [ ] **Step 2:** Correr: falla (no existe `#barra`).
- [ ] **Step 3:** Implementar. Fondo como `#svc-bar` (`rgba(244,247,248,.94)` + blur + borde `var(--line)`), contenido en `.wrap`, logo `img/logo/annessi-wordmark.svg` ~22 px de alto, botón `.btn btn-t` con alto ~38–40 px; ~56 px celular / ~64 px PC. Entrada con `transform: translateY(-100%)` → `none`, 0,25 s.
- [ ] **Step 4:** Correr: pasa.

### Task 3: Servicios y anclas respetan la barra; re-medir con fuentes

**Files:**
- Modify: `css/estilos.css:136` (`#svc-bar` `top: var(--barra-h, 0px)`), `:144` (`scroll-margin-top` + barra), `html{scroll-padding-top: var(--barra-h, 0px)}`
- Modify: `js/main.js` `applyMode`, `onScroll`, `goTo`, click `[data-go]`, `measure`, inicio

**Interfaces:**
- Consumes: `barraH()` de Task 2.
- En modo scroll, con `B = barraH()` y `V = innerHeight − B`: `stick.top = B`, `stick.height = V`, `track.height = V + SEG·h·0,75`; progreso `p = (B − track.top) / (track.height − V)`; los tamaños internos (`padTop`, `#horno`, `--vis-h`, `#ba-col`) se calculan con `V` en lugar de `h`. Saltos (`goTo`, `[data-go]`) restan `B`.
- `measure()` también en `document.fonts.ready` y `window` `load`.

- [ ] **Step 1:** El verificador ya mide `cortes`, `tapados`, `anclas` y resize 390→1366; correr: con barra y sin estos cambios, falla (`tapados` > 0).
- [ ] **Step 2:** Implementar.
- [ ] **Step 3:** Correr en todos los tamaños, normal y con fuentes lentas. Esperado: `cortes`, `tapados`, `anclas` vacíos. Comparar modos con la base y reportar los tamaños que pasaron de scroll a stack.

### Task 4: Revisión visual

- [ ] **Step 1:** Capturas en 360, 390, 768, 1366 y 1920: arriba de todo, en Servicios, en Galería, en el formulario; zoom al logo y al botón.
- [ ] **Step 2:** Revisar con criterio de diseño (alineación con la cabecera original, nada encimado con WhatsApp).
- [ ] **Step 3:** Preguntar a Tomás antes de commit/deploy.
