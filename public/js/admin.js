import { api, esc, esFotoSubida, etiquetasHTML, fotoHTML, precio } from './comun.js';

const lista = document.getElementById('lista');
const buscar = document.getElementById('buscar');
const botonesEstado = [...document.querySelectorAll('[data-estado]')];

const dialogo = document.getElementById('dialogo-producto');
const form = document.getElementById('form-producto');
const titulo = document.getElementById('titulo-producto');
const guardar = document.getElementById('guardar');
const errorForm = document.getElementById('error-form');
const entradaFoto = document.getElementById('foto');
const zonaFoto = document.getElementById('zona-foto');
const vistaFoto = document.getElementById('vista-foto');
const ayudaFoto = document.getElementById('ayuda-foto');
const cambiarFoto = document.getElementById('cambiar-foto');
const descripcion = document.getElementById('descripcion');
const contador = document.getElementById('contador-descripcion');

const dialogoEliminar = document.getElementById('dialogo-eliminar');
const tituloEliminar = document.getElementById('titulo-eliminar');
const errorEliminar = document.getElementById('error-eliminar');
const confirmarEliminar = document.getElementById('confirmar-eliminar');

const aviso = document.getElementById('aviso');

const acceso = document.getElementById('acceso');
const panel = document.getElementById('panel');
const formAcceso = document.getElementById('form-acceso');
const accesoTexto = document.getElementById('acceso-texto');
const clave = document.getElementById('clave');
const errorClave = document.getElementById('error-clave');
const ingresar = document.getElementById('ingresar');
const salir = document.getElementById('salir');

const TEXTO_ACCESO = 'Ingresa la contraseña para subir y modificar productos.';

const CAMPOS = ['foto', 'nombre', 'descripcion', 'precio', 'presentacion', 'mascota', 'etapa', 'categoria'];

let productos = [];
let estado = 'todos';
let editando = null; // producto que se edita, o null si es nuevo
let fotoNueva = null; // data URL lista para enviar
let porEliminar = null;

// --- Acceso ----------------------------------------------------------------

function mostrarAcceso(mensaje = TEXTO_ACCESO) {
  for (const d of [dialogo, dialogoEliminar]) if (d.open) d.close();
  panel.hidden = true;
  salir.hidden = true;
  acceso.hidden = false;
  accesoTexto.textContent = mensaje;
  formAcceso.reset();
  errorClave.textContent = '';
  clave.removeAttribute('aria-invalid');
  clave.focus();
}

function mostrarPanel() {
  acceso.hidden = true;
  panel.hidden = false;
  salir.hidden = false;
  cargar();
}

// Si la sesión venció mientras se trabajaba, vuelve a pedir la contraseña.
function sesionVencida(error) {
  if (error.estado !== 401) return false;
  mostrarAcceso('Tu sesión terminó. Ingresa la contraseña de nuevo.');
  return true;
}

async function iniciarSesion(evento) {
  evento.preventDefault();
  errorClave.textContent = '';
  if (!clave.value) {
    errorClave.textContent = 'Escribe la contraseña.';
    clave.setAttribute('aria-invalid', 'true');
    clave.focus();
    return;
  }
  ingresar.disabled = true;
  ingresar.textContent = 'Ingresando…';
  try {
    await api('/api/sesion', { metodo: 'POST', datos: { clave: clave.value } });
    mostrarPanel();
  } catch (error) {
    errorClave.textContent = error.message;
    clave.setAttribute('aria-invalid', 'true');
    clave.select();
  } finally {
    ingresar.disabled = false;
    ingresar.textContent = 'Ingresar';
  }
}

async function cerrarSesion() {
  try {
    await api('/api/sesion', { metodo: 'DELETE' });
  } catch (error) {
    avisar(error.message, { error: true });
    return;
  }
  productos = [];
  lista.innerHTML = '';
  mostrarAcceso();
  avisar('Sesión cerrada.');
}

async function iniciar() {
  try {
    const sesion = await api('/api/sesion');
    if (sesion.admin) return mostrarPanel();
    mostrarAcceso();
    if (!sesion.configurada) {
      accesoTexto.textContent = 'La administración está desactivada: falta definir ADMIN_PASSWORD en el archivo .env del servidor.';
      clave.disabled = true;
      ingresar.disabled = true;
    }
  } catch (error) {
    mostrarAcceso(error.message);
  }
}

// --- Lista -----------------------------------------------------------------

function filaHTML(p) {
  const nombre = esc(p.nombre);
  return `<li class="fila${p.activo ? '' : ' fila--pausada'}">
    <div class="fila__foto tinte--${p.mascota}">${fotoHTML(p, '')}</div>
    <div class="fila__info">
      <p class="fila__nombre">${nombre}</p>
      ${p.presentacion ? `<p class="fila__detalle">${esc(p.presentacion)}</p>` : ''}
      ${etiquetasHTML(p, { conCategoria: true })}
    </div>
    <p class="fila__precio">${precio(p.precio)}</p>
    <p class="fila__estado">${p.activo
      ? '<span class="estado estado--activo">En la tienda</span>'
      : '<span class="estado estado--pausado">Pausado</span>'}</p>
    <div class="fila__acciones">
      <button type="button" class="boton" data-accion="editar" data-id="${p.id}">Editar<span class="sr-only"> ${nombre}</span></button>
      <button type="button" class="boton" data-accion="alternar" data-id="${p.id}">${p.activo ? 'Pausar' : 'Reanudar'}<span class="sr-only"> ${nombre}</span></button>
      <button type="button" class="boton boton--borrar" data-accion="eliminar" data-id="${p.id}">Eliminar<span class="sr-only"> ${nombre}</span></button>
    </div>
  </li>`;
}

function pintar() {
  const activos = productos.filter((p) => p.activo).length;
  document.getElementById('n-todos').textContent = ` ${productos.length}`;
  document.getElementById('n-activos').textContent = ` ${activos}`;
  document.getElementById('n-pausados').textContent = ` ${productos.length - activos}`;
  for (const b of botonesEstado) b.setAttribute('aria-pressed', String(b.dataset.estado === estado));

  const texto = buscar.value.trim().toLocaleLowerCase('es');
  const visibles = productos.filter((p) =>
    (estado === 'todos' || (estado === 'activos') === p.activo)
    && (!texto || p.nombre.toLocaleLowerCase('es').includes(texto)));

  if (!productos.length) {
    lista.innerHTML = '<li class="lista__vacia">Todavía no hay productos. Usa «Subir producto» para agregar el primero.</li>';
  } else if (!visibles.length) {
    lista.innerHTML = '<li class="lista__vacia">Ningún producto coincide con la búsqueda o el filtro elegido.</li>';
  } else {
    lista.innerHTML = visibles.map(filaHTML).join('');
  }
}

async function cargar() {
  lista.innerHTML = '<li class="lista__vacia">Cargando productos…</li>';
  try {
    productos = await api('/api/productos?todos=1');
    pintar();
  } catch (error) {
    if (sesionVencida(error)) return;
    lista.innerHTML = `<li class="lista__vacia">${esc(error.message)}</li>`;
  }
}

function reemplazar(producto) {
  const i = productos.findIndex((p) => p.id === producto.id);
  if (i === -1) productos.unshift(producto);
  else productos[i] = producto;
}

// --- Aviso -----------------------------------------------------------------

let temporizadorAviso;
function avisar(mensaje, { error = false } = {}) {
  aviso.textContent = mensaje;
  aviso.classList.toggle('aviso--error', error);
  aviso.classList.add('aviso--visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => aviso.classList.remove('aviso--visible'), 3600);
}

// --- Foto ------------------------------------------------------------------

// Reduce la foto a 1200 px como máximo para que la subida sea liviana.
async function prepararFoto(archivo) {
  if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) {
    throw new Error('Usa una foto JPG, PNG o WebP.');
  }
  if (archivo.size > 20 * 1024 * 1024) {
    throw new Error('La foto pesa más de 20 MB. Elige una más liviana.');
  }
  let imagen;
  try {
    imagen = await createImageBitmap(archivo);
  } catch {
    throw new Error('No se pudo abrir la foto. Prueba con otro archivo.');
  }
  const escala = Math.min(1, 1200 / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  const ctx = lienzo.getContext('2d');
  ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  let resultado = lienzo.toDataURL('image/webp', 0.86);
  if (!resultado.startsWith('data:image/webp')) {
    // Navegadores sin WebP: JPG sobre fondo blanco para no perder la transparencia en negro.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    resultado = lienzo.toDataURL('image/jpeg', 0.88);
  }
  return resultado;
}

function mostrarFoto(src, subida) {
  vistaFoto.src = src || '';
  vistaFoto.hidden = !src;
  vistaFoto.classList.toggle('foto--subida', Boolean(subida));
  ayudaFoto.hidden = Boolean(src);
  cambiarFoto.hidden = !src;
  zonaFoto.classList.toggle('zona-foto--con-foto', Boolean(src));
}

async function usarArchivo(archivo) {
  if (!archivo) return;
  marcarError('foto', '');
  try {
    fotoNueva = await prepararFoto(archivo);
    mostrarFoto(fotoNueva, true);
  } catch (error) {
    marcarError('foto', error.message);
  }
}

function pintarTinte() {
  const mascota = form.elements.mascota.value || 'ambos';
  zonaFoto.className = zonaFoto.className.replace(/\s?tinte--\w+/g, '') + ` tinte--${mascota}`;
}

// --- Formulario ------------------------------------------------------------

function marcarError(campo, mensaje) {
  document.getElementById(`error-${campo}`).textContent = mensaje;
  const elemento = campo === 'mascota' ? document.getElementById('segmentos-mascota') : form.elements[campo];
  elemento?.setAttribute('aria-invalid', String(Boolean(mensaje)));
}

function limpiarErrores() {
  for (const campo of CAMPOS) marcarError(campo, '');
  errorForm.textContent = '';
}

function enfocarCampo(campo) {
  const elemento = campo === 'mascota' ? form.querySelector('[name="mascota"]') : form.elements[campo];
  elemento?.focus();
}

function actualizarContador() {
  contador.textContent = `${descripcion.value.length}/160`;
}

function abrirFormulario(producto = null) {
  editando = producto;
  fotoNueva = null;
  form.reset();
  limpiarErrores();
  titulo.textContent = producto ? 'Editar producto' : 'Subir producto';
  guardar.textContent = producto ? 'Guardar cambios' : 'Subir producto';

  if (producto) {
    for (const campo of ['nombre', 'descripcion', 'precio', 'presentacion', 'etapa', 'categoria']) {
      form.elements[campo].value = producto[campo];
    }
    form.elements.mascota.value = producto.mascota;
    form.elements.activo.checked = producto.activo;
    mostrarFoto(producto.foto, esFotoSubida(producto));
  } else {
    mostrarFoto(null);
  }
  actualizarContador();
  pintarTinte();
  dialogo.showModal();
  form.elements.nombre.focus();
}

function leerFormulario() {
  const e = form.elements;
  return {
    nombre: e.nombre.value.trim(),
    descripcion: e.descripcion.value.trim(),
    precio: e.precio.value === '' ? null : Number(e.precio.value),
    presentacion: e.presentacion.value.trim(),
    mascota: e.mascota.value || null,
    etapa: e.etapa.value || null,
    categoria: e.categoria.value || null,
    activo: e.activo.checked,
  };
}

function validar(datos) {
  const errores = {};
  if (!editando && !fotoNueva) errores.foto = 'Agrega una foto del producto.';
  if (!datos.nombre) errores.nombre = 'Escribe el nombre del producto.';
  if (!datos.descripcion) errores.descripcion = 'Escribe una descripción breve.';
  if (datos.precio === null || Number.isNaN(datos.precio)) errores.precio = 'Escribe el precio con números.';
  else if (datos.precio <= 0) errores.precio = 'El precio debe ser mayor que cero.';
  if (!datos.mascota) errores.mascota = 'Elige para qué mascota es.';
  if (!datos.etapa) errores.etapa = 'Elige la etapa de vida.';
  if (!datos.categoria) errores.categoria = 'Elige el tipo de producto.';
  return errores;
}

async function enviar(evento) {
  evento.preventDefault();
  limpiarErrores();
  const datos = leerFormulario();
  const errores = validar(datos);
  const campos = Object.keys(errores);
  if (campos.length) {
    for (const campo of campos) marcarError(campo, errores[campo]);
    enfocarCampo(CAMPOS.find((c) => errores[c]));
    return;
  }
  if (fotoNueva) datos.foto = fotoNueva;

  const textoBoton = guardar.textContent;
  guardar.disabled = true;
  guardar.textContent = editando ? 'Guardando…' : 'Subiendo…';
  try {
    const producto = editando
      ? await api(`/api/productos/${editando.id}`, { metodo: 'PATCH', datos })
      : await api('/api/productos', { metodo: 'POST', datos });
    reemplazar(producto);
    dialogo.close();
    pintar();
    avisar(editando ? 'Cambios guardados.' : 'Producto subido.');
  } catch (error) {
    if (sesionVencida(error)) return;
    if (error.campo && CAMPOS.includes(error.campo)) {
      marcarError(error.campo, error.message);
      enfocarCampo(error.campo);
    } else {
      errorForm.textContent = error.message;
    }
  } finally {
    guardar.disabled = false;
    guardar.textContent = textoBoton;
  }
}

// --- Acciones de cada fila --------------------------------------------------

async function alternar(producto, boton) {
  boton.disabled = true;
  try {
    const actualizado = await api(`/api/productos/${producto.id}`, { metodo: 'PATCH', datos: { activo: !producto.activo } });
    reemplazar(actualizado);
    pintar();
    avisar(actualizado.activo
      ? `«${actualizado.nombre}» reanudado: vuelve a aparecer en la tienda.`
      : `«${actualizado.nombre}» pausado: ya no aparece en la tienda.`);
  } catch (error) {
    boton.disabled = false;
    if (sesionVencida(error)) return;
    avisar(error.message, { error: true });
  }
}

function pedirEliminar(producto) {
  porEliminar = producto;
  tituloEliminar.textContent = `¿Eliminar «${producto.nombre}»?`;
  errorEliminar.textContent = '';
  dialogoEliminar.showModal();
}

async function eliminar() {
  confirmarEliminar.disabled = true;
  try {
    await api(`/api/productos/${porEliminar.id}`, { metodo: 'DELETE' });
    productos = productos.filter((p) => p.id !== porEliminar.id);
    dialogoEliminar.close();
    pintar();
    avisar(`«${porEliminar.nombre}» eliminado.`);
  } catch (error) {
    if (sesionVencida(error)) return;
    errorEliminar.textContent = error.message;
  } finally {
    confirmarEliminar.disabled = false;
  }
}

// --- Eventos ---------------------------------------------------------------

document.getElementById('nuevo').addEventListener('click', () => abrirFormulario());

lista.addEventListener('click', (e) => {
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const producto = productos.find((p) => p.id === Number(boton.dataset.id));
  if (!producto) return;
  if (boton.dataset.accion === 'editar') abrirFormulario(producto);
  if (boton.dataset.accion === 'alternar') alternar(producto, boton);
  if (boton.dataset.accion === 'eliminar') pedirEliminar(producto);
});

for (const b of botonesEstado) {
  b.addEventListener('click', () => {
    estado = b.dataset.estado;
    pintar();
  });
}
buscar.addEventListener('input', pintar);

form.addEventListener('submit', enviar);
form.addEventListener('change', (e) => {
  if (e.target.name === 'mascota') {
    pintarTinte();
    marcarError('mascota', '');
  }
});
form.addEventListener('input', (e) => {
  if (e.target === descripcion) actualizarContador();
  if (CAMPOS.includes(e.target.name)) marcarError(e.target.name, '');
});

entradaFoto.addEventListener('change', () => {
  usarArchivo(entradaFoto.files[0]);
  entradaFoto.value = '';
});
zonaFoto.addEventListener('dragover', (e) => {
  e.preventDefault();
  zonaFoto.classList.add('zona-foto--arrastrando');
});
zonaFoto.addEventListener('dragleave', () => zonaFoto.classList.remove('zona-foto--arrastrando'));
zonaFoto.addEventListener('drop', (e) => {
  e.preventDefault();
  zonaFoto.classList.remove('zona-foto--arrastrando');
  usarArchivo(e.dataTransfer.files[0]);
});

confirmarEliminar.addEventListener('click', eliminar);
for (const d of [dialogo, dialogoEliminar]) {
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-cerrar]')) d.close();
  });
}

formAcceso.addEventListener('submit', iniciarSesion);
clave.addEventListener('input', () => {
  errorClave.textContent = '';
  clave.removeAttribute('aria-invalid');
});
salir.addEventListener('click', cerrarSesion);

iniciar();
