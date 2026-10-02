// Productos: validación, consultas y la carga inicial de los productos de muestra.
import { PRODUCTOS } from '../seed.js';
import { ahora, CATEGORIAS, db, esquemaListo, ETAPAS, filas, MASCOTAS } from './db.js';
import { borrarFoto, guardarFoto } from './fotos.js';
import { ErrorCliente } from './http.js';

// --- validación ---------------------------------------------------------------

function texto(datos, campo, etiqueta, maximo, obligatorio = true) {
  let valor = datos[campo] ?? '';
  if (typeof valor !== 'string') throw new ErrorCliente(`${etiqueta} debe ser texto.`, campo);
  valor = valor.split(/\s+/).filter(Boolean).join(' ');
  if (obligatorio && !valor) throw new ErrorCliente(`Escribe ${etiqueta.toLowerCase()}.`, campo);
  if ([...valor].length > maximo) throw new ErrorCliente(`${etiqueta} puede tener hasta ${maximo} caracteres.`, campo);
  return valor;
}

function opcion(datos, campo, opciones, mensaje) {
  if (!opciones.includes(datos[campo])) throw new ErrorCliente(mensaje, campo);
  return datos[campo];
}

function precio(valor) {
  if (typeof valor !== 'number' || Number.isNaN(valor)) throw new ErrorCliente('Escribe el precio con números.', 'precio');
  if (valor <= 0) throw new ErrorCliente('El precio debe ser mayor que cero.', 'precio');
  if (valor > 100_000_000) throw new ErrorCliente('Revisa el precio: es demasiado alto.', 'precio');
  return Math.round(valor * 100) / 100;
}

function activo(valor) {
  if (typeof valor !== 'boolean') throw new ErrorCliente('El estado del producto debe ser verdadero o falso.', 'activo');
  return valor ? 1 : 0;
}

const OPCIONALES = new Set(['presentacion', 'activo']);

/** Devuelve solo los campos presentes y válidos. Con parcial = false exige todos. */
function validar(datos, parcial) {
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) {
    throw new ErrorCliente('El cuerpo de la solicitud debe ser un objeto JSON.');
  }
  const reglas = {
    nombre: () => texto(datos, 'nombre', 'El nombre', 80),
    descripcion: () => texto(datos, 'descripcion', 'La descripción', 160),
    presentacion: () => texto(datos, 'presentacion', 'La presentación', 30, false),
    mascota: () => opcion(datos, 'mascota', MASCOTAS, 'Elige para qué mascota es.'),
    etapa: () => opcion(datos, 'etapa', ETAPAS, 'Elige la etapa de vida.'),
    categoria: () => opcion(datos, 'categoria', CATEGORIAS, 'Elige el tipo de producto.'),
    precio: () => precio(datos.precio),
    activo: () => activo(datos.activo),
  };
  const limpio = {};
  for (const [campo, regla] of Object.entries(reglas)) {
    if (Object.hasOwn(datos, campo)) limpio[campo] = regla();
    else if (!parcial && !OPCIONALES.has(campo)) limpio[campo] = regla(); // lanza el error de campo obligatorio
  }
  return limpio;
}

// --- base ---------------------------------------------------------------------

const aProducto = (fila) => ({ ...fila, activo: Boolean(fila.activo) });

const insercion = (datos) => {
  const marca = ahora();
  const fila = { ...datos, creado: marca, actualizado: marca };
  const columnas = Object.keys(fila);
  return {
    sql: `INSERT INTO productos (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`,
    args: Object.values(fila),
  };
};

// Carga los productos de muestra una sola vez, aunque arranquen varias instancias a la vez:
// la marca en `meta` se escribe dentro de la misma transacción.
async function cargarMuestras() {
  const tx = await db.transaction('write');
  try {
    const { rowsAffected } = await tx.execute("INSERT OR IGNORE INTO meta (clave) VALUES ('muestras')");
    const { rows } = await tx.execute('SELECT COUNT(*) AS total FROM productos');
    if (rowsAffected && Number(rows[0].total) === 0) {
      await tx.batch(PRODUCTOS.map((p) =>
        insercion({ ...validar(p, false), foto: p.foto, activo: p.activo === false ? 0 : 1 })));
    }
    await tx.commit();
  } finally {
    tx.close();
  }
}

let preparada;
const lista = () => {
  preparada ??= esquemaListo().then(cargarMuestras).catch((error) => {
    preparada = undefined;
    throw error;
  });
  return preparada;
};

export async function buscar(id) {
  await lista();
  const [fila] = filas(await db.execute({ sql: 'SELECT * FROM productos WHERE id = ?', args: [id] }));
  if (!fila) throw new ErrorCliente('Ese producto no existe o ya fue eliminado.', null, 404);
  return aProducto(fila);
}

// --- operaciones ----------------------------------------------------------------

export async function listar(todos) {
  await lista();
  const filtro = todos ? '' : 'WHERE activo = 1';
  return filas(await db.execute(`SELECT * FROM productos ${filtro} ORDER BY creado DESC, id DESC`)).map(aProducto);
}

export async function crear(datos) {
  await lista();
  const limpio = validar(datos, false);
  if (!datos.foto) throw new ErrorCliente('Agrega una foto del producto.', 'foto');
  limpio.foto = await guardarFoto(datos.foto);
  limpio.activo ??= 1;
  try {
    const { lastInsertRowid } = await db.execute(insercion(limpio));
    return await buscar(Number(lastInsertRowid));
  } catch (error) {
    await borrarFoto(limpio.foto);
    throw error;
  }
}

export async function modificar(id, datos) {
  const limpio = validar(datos, true);
  const anterior = await buscar(id);
  if (datos.foto) limpio.foto = await guardarFoto(datos.foto);
  if (!Object.keys(limpio).length) return anterior;
  limpio.actualizado = ahora();
  const asignaciones = Object.keys(limpio).map((c) => `${c} = ?`).join(', ');
  let cambios;
  try {
    ({ rowsAffected: cambios } = await db.execute({
      sql: `UPDATE productos SET ${asignaciones} WHERE id = ?`,
      args: [...Object.values(limpio), id],
    }));
  } catch (error) {
    await borrarFoto(limpio.foto);
    throw error;
  }
  if (!cambios) {
    // Lo eliminaron mientras se guardaba la foto nueva.
    await borrarFoto(limpio.foto);
    return buscar(id);
  }
  if (limpio.foto) await borrarFoto(anterior.foto);
  return buscar(id);
}

export async function eliminar(id) {
  const producto = await buscar(id);
  await db.execute({ sql: 'DELETE FROM productos WHERE id = ?', args: [id] });
  await borrarFoto(producto.foto);
}
