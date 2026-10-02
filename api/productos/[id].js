// GET, PATCH y DELETE /api/productos/<id>. Los pausados solo se ven con sesión.
import { esAdmin, exigirAdmin } from '../../lib/acceso.js';
import { ErrorCliente, json, leerJSON, manejar } from '../../lib/http.js';
import { buscar, eliminar, modificar } from '../../lib/tienda.js';

function idDe(request) {
  const m = /^\/api\/productos\/(\d+)$/.exec(new URL(request.url).pathname);
  if (!m) throw new ErrorCliente('Ruta no encontrada.', null, 404);
  return Number(m[1]);
}

export const GET = manejar(async (request) => {
  const producto = await buscar(idDe(request));
  if (!producto.activo && !(await esAdmin(request))) {
    throw new ErrorCliente('Ese producto no existe o ya fue eliminado.', null, 404);
  }
  return json(200, producto);
});

export const PATCH = manejar(async (request) => {
  const id = idDe(request);
  await exigirAdmin(request);
  return json(200, await modificar(id, await leerJSON(request)));
});

export const DELETE = manejar(async (request) => {
  const id = idDe(request);
  await exigirAdmin(request);
  await eliminar(id);
  return json(204);
});
