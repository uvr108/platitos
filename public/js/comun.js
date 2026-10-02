// Datos y utilidades que comparten la tienda y la administración.

// Cambia aquí la moneda de la tienda.
const MONEDA = { locale: 'es-CL', currency: 'CLP' };
const formatoPrecio = new Intl.NumberFormat(MONEDA.locale, { style: 'currency', currency: MONEDA.currency });

export const precio = (n) => formatoPrecio.format(n);

export const MASCOTAS = { perro: 'Perro', gato: 'Gato', ambos: 'Perro y gato' };

export const ETAPAS = { cachorro: 'Cachorro o gatito', adulto: 'Adulto', senior: 'Senior', todas: 'Todas las etapas' };

export const CATEGORIAS = {
  seco: 'Alimento seco',
  humedo: 'Alimento húmedo',
  natural: 'Comida natural',
  snack: 'Snacks y premios',
  suplemento: 'Suplementos alimenticios',
};

export function nombreEtapa(etapa, mascota) {
  if (etapa !== 'cachorro') return ETAPAS[etapa];
  return { perro: 'Cachorro', gato: 'Gatito' }[mascota] ?? ETAPAS.cachorro;
}

export function esc(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function etiquetasHTML(p, { conCategoria = false } = {}) {
  return `<p class="etiquetas">
    <span class="chip chip--${p.mascota}">${MASCOTAS[p.mascota]}</span>
    <span class="chip chip--neutro">${nombreEtapa(p.etapa, p.mascota)}</span>
    ${conCategoria ? `<span class="chip chip--neutro">${CATEGORIAS[p.categoria]}</span>` : ''}
  </p>`;
}

// Las ilustraciones de muestra viven en /img/; lo demás son fotos subidas (uploads/ o Vercel Blob).
export const esFotoSubida = (p) => !p.foto.startsWith('/img/');

export function fotoHTML(p, alt = p.nombre) {
  const subida = esFotoSubida(p) ? ' class="foto--subida"' : '';
  return `<img src="${esc(p.foto)}" alt="${esc(alt)}"${subida} loading="lazy" decoding="async">`;
}

export async function api(ruta, { metodo = 'GET', datos } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      headers: datos ? { 'Content-Type': 'application/json' } : undefined,
      body: datos ? JSON.stringify(datos) : undefined,
    });
  } catch {
    throw new Error('No hay conexión con el servidor. Revisa que esté en marcha e inténtalo de nuevo.');
  }
  const cuerpo = respuesta.status === 204 ? null : await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const error = new Error(cuerpo?.error ?? `El servidor respondió con un error (${respuesta.status}).`);
    error.campo = cuerpo?.campo ?? null;
    error.estado = respuesta.status;
    throw error;
  }
  return cuerpo;
}
