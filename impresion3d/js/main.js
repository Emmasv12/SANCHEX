/* =========================================================
   CAPA3D · JavaScript
   ========================================================= */

/* ---------- CONFIGURACIÓN (edita esto) ---------- */
const CONFIG = {
  // Tu correo: aquí llegarán los pedidos y mensajes.
  email: 'tucorreo@ejemplo.com',

  // Opcional: si creas un formulario en https://formspree.io pega aquí su URL
  // (ej.: 'https://formspree.io/f/xxxxxxx'). Con eso los formularios se envían
  // solos, incluidos los archivos. Si lo dejas vacío, se abrirá el programa de
  // correo del cliente con el mensaje ya redactado.
  formEndpoint: '',

  catalogoXML: 'data/catalogo.xml'
};

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/* ---------- Navegación móvil ---------- */
const navToggle = $('#navToggle');
const menu = $('#menu');

navToggle.addEventListener('click', () => {
  const open = menu.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open);
  navToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
});
$$('#menu a').forEach(a => a.addEventListener('click', () => {
  menu.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
}));

/* Enlace activo según la sección visible */
const sections = $$('main section[id]');
const links = $$('#menu a[href^="#"]');
const spy = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + e.target.id));
    }
  });
}, { rootMargin: '-45% 0px -50% 0px' });
sections.forEach(s => spy.observe(s));

/* ---------- Botón volver arriba + año ---------- */
const toTop = $('#toTop');
window.addEventListener('scroll', () => { toTop.hidden = window.scrollY < 600; }, { passive: true });
toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
$('#year').textContent = new Date().getFullYear();

/* ---------- Animación de aparición al hacer scroll ---------- */
function initReveal() {
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); } });
  }, { threshold: .12 });
  $$('.reveal:not(.in)').forEach(el => io.observe(el));
}

/* ---------- Carga del catálogo (XML) ---------- */
async function cargarCatalogo() {
  try {
    const res = await fetch(CONFIG.catalogoXML);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const xml = new DOMParser().parseFromString(await res.text(), 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('XML mal formado');

    const categorias = $$('categoria', xml).map(c => ({
      id: c.getAttribute('id'),
      nombre: c.getAttribute('nombre'),
      descripcion: $('descripcion', c)?.textContent.trim() ?? '',
      productos: $$('producto', c).map(p => {
        const pr = $('precio', p);
        return {
          id: p.getAttribute('id'),
          nombre: $('nombre', p).textContent.trim(),
          descripcion: $('descripcion', p).textContent.trim(),
          precio: parseFloat(pr.textContent),
          moneda: pr.getAttribute('moneda'),
          desde: pr.getAttribute('desde') === 'true',
          imagen: $('imagen', p).textContent.trim()
        };
      })
    }));

    pintarGaleria(categorias);
    pintarPrecios(categorias);
  } catch (err) {
    console.error(err);
    const msg = `<p class="note">No se pudo cargar el catálogo. Si abres el archivo haciendo doble clic, el navegador lo bloquea:
      usa la extensión <strong>Live Server</strong> de VS Code (clic derecho en <code>index.html</code> → «Open with Live Server»).</p>`;
    $('#galPanels').innerHTML = msg;
    $('#priceGrid').innerHTML = msg;
  }
  initReveal();
}

const euros = (n, moneda = 'EUR') =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(n);

const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Galería con pestañas + carruseles ---------- */
function pintarGaleria(cats) {
  const tabs = $('#galTabs');
  const panels = $('#galPanels');

  tabs.innerHTML = cats.map((c, i) =>
    `<button class="tab" role="tab" id="tab-${c.id}" aria-controls="panel-${c.id}" aria-selected="${i === 0}" data-id="${c.id}">${esc(c.nombre)}</button>`
  ).join('');

  panels.innerHTML = cats.map((c, i) => `
    <div class="panel" role="tabpanel" id="panel-${c.id}" aria-labelledby="tab-${c.id}" ${i ? 'hidden' : ''}>
      <p class="panel-desc">${esc(c.descripcion)}</p>
      <div class="carousel">
        <button class="car-btn prev" aria-label="Anterior">‹</button>
        <div class="track" tabindex="0" aria-label="${esc(c.nombre)}">
          ${c.productos.map(p => `
            <article class="slide">
              <img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy" draggable="false">
              <div class="slide-body"><h3>${esc(p.nombre)}</h3><p>${esc(p.descripcion)}</p></div>
            </article>`).join('')}
        </div>
        <button class="car-btn next" aria-label="Siguiente">›</button>
        <div class="dots"></div>
      </div>
    </div>`).join('');

  $$('.carousel').forEach(initCarousel);

  tabs.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    $$('.tab', tabs).forEach(t => t.setAttribute('aria-selected', t === tab));
    $$('.panel', panels).forEach(p => { p.hidden = p.id !== 'panel-' + tab.dataset.id; });
    $$('.carousel', panels).forEach(updateCarousel);
  });

  // Flechas del teclado entre pestañas
  tabs.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const all = $$('.tab', tabs);
    const i = all.indexOf(document.activeElement);
    const next = all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
    next.focus(); next.click();
  });
}

/* Carrusel: scroll-snap + arrastre con ratón + flechas + puntos */
const carState = new WeakMap();

function initCarousel(car) {
  const track = $('.track', car);
  const prev = $('.prev', car);
  const next = $('.next', car);
  const dots = $('.dots', car);
  const slides = $$('.slide', track);

  dots.innerHTML = slides.map((_, i) => `<button class="dot" aria-label="Ir a la imagen ${i + 1}"></button>`).join('');
  carState.set(car, { track, prev, next, dots, slides });

  const step = () => (slides[0]?.offsetWidth ?? 300) + 19;
  prev.addEventListener('click', () => track.scrollBy({ left: -step() }));
  next.addEventListener('click', () => track.scrollBy({ left: step() }));
  $$('.dot', dots).forEach((d, i) => d.addEventListener('click', () =>
    track.scrollTo({ left: slides[i].offsetLeft - track.offsetLeft })));

  track.addEventListener('scroll', () => updateCarousel(car), { passive: true });
  track.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') track.scrollBy({ left: step() });
    if (e.key === 'ArrowLeft') track.scrollBy({ left: -step() });
  });

  // Arrastrar con el ratón (en táctil ya funciona el deslizar nativo)
  let down = false, startX = 0, startLeft = 0, moved = false;
  track.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    down = true; moved = false; startX = e.clientX; startLeft = track.scrollLeft;
  });
  window.addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) { moved = true; track.classList.add('dragging'); }
    track.scrollLeft = startLeft - dx;
  });
  window.addEventListener('pointerup', () => {
    if (!down) return;
    down = false;
    track.classList.remove('dragging');
    if (moved) { // encaja en la diapositiva más cercana
      const i = Math.round(track.scrollLeft / step());
      track.scrollTo({ left: i * step() });
    }
  });

  updateCarousel(car);
}

function updateCarousel(car) {
  const s = carState.get(car);
  if (!s || !s.track.offsetWidth) return;
  const { track, prev, next, dots, slides } = s;
  const max = track.scrollWidth - track.clientWidth - 2;
  prev.disabled = track.scrollLeft <= 2;
  next.disabled = track.scrollLeft >= max;

  const center = track.scrollLeft + track.clientWidth / 2;
  let active = 0, best = Infinity;
  slides.forEach((sl, i) => {
    const d = Math.abs(sl.offsetLeft - track.offsetLeft + sl.offsetWidth / 2 - center);
    if (d < best) { best = d; active = i; }
  });
  if (track.scrollLeft >= max) active = slides.length - 1;
  $$('.dot', dots).forEach((d, i) => d.classList.toggle('on', i === active));
}
window.addEventListener('resize', () => $$('.carousel').forEach(updateCarousel));

/* ---------- Precios ---------- */
function pintarPrecios(cats) {
  $('#priceGrid').innerHTML = cats.map(c => `
    <article class="price-card reveal">
      <h3>${esc(c.nombre)}</h3>
      <p>${esc(c.descripcion)}</p>
      <ul class="price-list">
        ${c.productos.map(p => `
          <li>
            <span class="price-name">${esc(p.nombre)}</span>
            <span class="price-val">${p.desde ? '<small>desde</small>' : ''}${euros(p.precio, p.moneda)}</span>
          </li>`).join('')}
      </ul>
    </article>`).join('');
}

/* ---------- Pedido personalizado: mostrar/ocultar campos ---------- */
const formPedido = $('#formPedido');

function actualizarTipo() {
  const tipo = formPedido.tipo.value;
  $$('[data-show]', formPedido).forEach(el => { el.hidden = el.dataset.show !== tipo; });
  $('#lblComentarios').textContent = tipo === 'idea'
    ? 'Cuéntame tu idea *' : 'Comentarios';
  $('#pComentarios').required = tipo === 'idea';
}
$$('input[name="tipo"]', formPedido).forEach(r => r.addEventListener('change', actualizarTipo));
actualizarTipo();

/* Zona de arrastrar archivo */
const dz = $('#dropzone');
const fileInput = $('#pArchivo');
const dzText = $('#dzText');
const MAX_MB = 25;

function mostrarArchivo() {
  const f = fileInput.files[0];
  dzText.textContent = f ? `✔ ${f.name} (${(f.size / 1048576).toFixed(1)} MB)` : 'Arrastra tu archivo aquí o haz clic para elegirlo';
}
fileInput.addEventListener('change', mostrarArchivo);
['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
dz.addEventListener('drop', e => {
  if (e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; mostrarArchivo(); }
});

/* ---------- Validación y envío ---------- */
function setError(input, msg) {
  const field = input.closest('.field');
  field.classList.toggle('invalid', !!msg);
  const small = $('.error', field);
  if (small) small.textContent = msg || '';
  return !msg;
}

function validar(form) {
  let ok = true;
  $$('input[required], textarea[required]', form).forEach(el => {
    if (el.closest('[hidden]')) return;
    let msg = '';
    if (!el.value.trim()) msg = 'Este campo es obligatorio.';
    else if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value)) msg = 'Introduce un correo válido.';
    ok = setError(el, msg) && ok;
  });
  const url = $('#pEnlace', form);
  if (url && !url.closest('[hidden]') && url.value.trim()) {
    try { new URL(url.value); setError(url, ''); } catch { ok = setError(url, 'Introduce un enlace válido (https://…).') && ok; }
  }
  const f = fileInput.files[0];
  if (form === formPedido && f && f.size > MAX_MB * 1048576) {
    dzText.textContent = `⚠ El archivo supera ${MAX_MB} MB. Pásame un enlace de descarga en su lugar.`;
    ok = false;
  }
  return ok;
}

async function enviar(form, statusEl, asunto, lineas) {
  statusEl.className = 'form-status';
  if (!validar(form)) {
    statusEl.textContent = 'Revisa los campos marcados.';
    statusEl.classList.add('ko');
    return;
  }

  if (CONFIG.formEndpoint) {
    try {
      const data = new FormData(form);
      data.append('_subject', asunto);
      const res = await fetch(CONFIG.formEndpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error();
      statusEl.textContent = '¡Enviado! Te respondo muy pronto 🙌';
      statusEl.classList.add('ok');
      form.reset(); mostrarArchivo(); if (form === formPedido) actualizarTipo();
    } catch {
      statusEl.textContent = 'No se pudo enviar. Inténtalo de nuevo o escríbeme por correo.';
      statusEl.classList.add('ko');
    }
    return;
  }

  // Sin servidor: abrimos el correo del cliente con el texto preparado
  const cuerpo = lineas.filter(Boolean).join('\n');
  window.location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  statusEl.textContent = 'Se ha abierto tu programa de correo con el mensaje listo. ¡Solo tienes que enviarlo!';
  statusEl.classList.add('ok');
}

formPedido.addEventListener('submit', e => {
  e.preventDefault();
  const f = formPedido, tipo = f.tipo.value, arch = fileInput.files[0];
  enviar(f, $('#statusPedido'), `Pedido personalizado de ${f.nombre.value}`, [
    `Nombre: ${f.nombre.value}`,
    `Correo: ${f.email.value}`,
    `Tipo: ${tipo}`,
    tipo === 'archivo' && arch ? `Archivo: ${arch.name} (adjúntalo a este correo)` : '',
    tipo === 'enlace' && f.enlace.value ? `Enlace: ${f.enlace.value}` : '',
    `Material: ${f.material.value}`,
    f.color.value ? `Color: ${f.color.value}` : '',
    '',
    `Comentarios: ${f.comentarios.value}`
  ]);
});

$('#formContacto').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  enviar(f, $('#statusContacto'), f.asunto.value || `Mensaje de ${f.nombre.value}`, [
    `Nombre: ${f.nombre.value}`,
    `Correo: ${f.email.value}`,
    f.telefono.value ? `Teléfono: ${f.telefono.value}` : '',
    '',
    f.mensaje.value
  ]);
});

/* Quitar el error al escribir */
$$('input, textarea').forEach(el => el.addEventListener('input', () => setError(el, '')));

/* ---------- Arranque ---------- */
cargarCatalogo();
initReveal();
