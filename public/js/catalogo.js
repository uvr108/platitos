import { api, CATEGORIAS, esc, etiquetasHTML, fotoHTML, precio } from './comun.js';

const NOTAS = {
  seco: 'La base de la dieta diaria. Se conserva bien una vez abierto.',
  humedo: 'Más agua y más sabor. Sirve solo o mezclado con el alimento seco.',
  natural: 'Recetas cocidas con ingredientes frescos. Se guardan congeladas.',
  snack: 'Para premiar y entrenar. Que no pasen del 10 % de las calorías del día.',
  suplemento: 'Complementan el alimento en etapas o necesidades específicas.',
};

const PREDETERMINADO = { tipo: 'todo', mascota: 'todas', etapa: 'todas' };

const form = document.getElementById('filtros');
const selects = [...form.querySelectorAll('select')];
const grupos = document.getElementById('grupos');
const conteo = document.getElementById('conteo');
const limpiar = document.getElementById('limpiar');
const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)');

let productos = [];

// --- Filtros ---------------------------------------------------------------

function leerFiltros() {
  return Object.fromEntries(selects.map((s) => [s.name, s.value]));
}

function filtrosDesdeURL() {
  const q = new URLSearchParams(location.search);
  for (const s of selects) {
    const valor = q.get(s.name);
    if (valor && [...s.options].some((o) => o.value === valor)) s.value = valor;
  }
}

function guardarEnURL(filtros) {
  const q = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== PREDETERMINADO[clave]) q.set(clave, valor);
  }
  const texto = q.toString();
  history.replaceState(null, '', location.pathname + (texto ? `?${texto}` : ''));
}

function coincide(p, f) {
  return (f.tipo === 'todo' || p.categoria === f.tipo)
    && (f.mascota === 'todas' || p.mascota === f.mascota || p.mascota === 'ambos')
    && (f.etapa === 'todas' || p.etapa === f.etapa || p.etapa === 'todas');
}

// Un <select> no se ajusta solo a su texto: lo medimos con un span gemelo.
const medidor = document.createElement('span');
medidor.className = 'frase__opcion frase__medidor';
medidor.setAttribute('aria-hidden', 'true');
form.append(medidor);

function ajustarAnchos() {
  for (const s of selects) {
    medidor.textContent = s.options[s.selectedIndex].text;
    s.style.width = `${Math.ceil(medidor.getBoundingClientRect().width) + 2}px`;
  }
}

// --- Pintado ---------------------------------------------------------------

function productoHTML(p) {
  return `<article class="producto">
    <div class="producto__foto tinte--${p.mascota}">${fotoHTML(p)}</div>
    ${etiquetasHTML(p)}
    <h3 class="producto__nombre">${esc(p.nombre)}</h3>
    <p class="producto__desc">${esc(p.descripcion)}</p>
    <p class="producto__precio"><strong>${precio(p.precio)}</strong>${p.presentacion ? `<span>${esc(p.presentacion)}</span>` : ''}</p>
  </article>`;
}

function pintar() {
  const filtros = leerFiltros();
  const visibles = productos
    .filter((p) => coincide(p, filtros))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const filtrado = Object.entries(filtros).some(([k, v]) => v !== PREDETERMINADO[k]);

  conteo.textContent = visibles.length === 1 ? '1 producto' : `${visibles.length} productos`;
  limpiar.hidden = !filtrado;

  if (visibles.length === 0) {
    grupos.innerHTML = `<div class="estado-catalogo">
      <p class="estado-catalogo__titulo">No hay productos para esa combinación.</p>
      <p>Prueba con otra edad o elige «de todo» en el tipo de producto.</p>
      <button type="button" class="boton" data-limpiar>Ver todo el catálogo</button>
    </div>`;
    return;
  }

  grupos.innerHTML = Object.keys(CATEGORIAS)
    .map((categoria) => {
      const lista = visibles.filter((p) => p.categoria === categoria);
      if (!lista.length) return '';
      return `<section class="grupo" aria-labelledby="g-${categoria}">
        <div class="grupo__cabecera">
          <h2 class="grupo__titulo" id="g-${categoria}">${CATEGORIAS[categoria]} <span class="grupo__cuenta">${lista.length}</span></h2>
          <p class="grupo__nota">${NOTAS[categoria]}</p>
        </div>
        <div class="grilla">${lista.map(productoHTML).join('')}</div>
      </section>`;
    })
    .join('');
}

function alCambiarFiltro() {
  ajustarAnchos();
  guardarEnURL(leerFiltros());
  pintar();
  if (!sinMovimiento.matches) {
    grupos.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
  }
}

function verTodo() {
  for (const s of selects) s.value = PREDETERMINADO[s.name];
  alCambiarFiltro();
}

// --- Inicio ----------------------------------------------------------------

async function cargar() {
  conteo.textContent = 'Cargando productos…';
  try {
    productos = await api('/api/productos');
    pintar();
  } catch (error) {
    conteo.textContent = '';
    grupos.innerHTML = `<div class="estado-catalogo">
      <p class="estado-catalogo__titulo">No se pudo cargar el catálogo.</p>
      <p>${esc(error.message)}</p>
      <button type="button" class="boton" data-reintentar>Reintentar</button>
    </div>`;
  }
}

form.addEventListener('change', alCambiarFiltro);
form.addEventListener('submit', (e) => e.preventDefault());
limpiar.addEventListener('click', verTodo);
grupos.addEventListener('click', (e) => {
  if (e.target.closest('[data-limpiar]')) verTodo();
  if (e.target.closest('[data-reintentar]')) cargar();
});
addEventListener('resize', ajustarAnchos);
document.fonts?.ready.then(ajustarAnchos);

filtrosDesdeURL();
ajustarAnchos();
cargar();
