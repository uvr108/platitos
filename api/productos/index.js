// GET /api/productos (con ?todos=1 incluye pausados; requiere sesión) y POST /api/productos.
import { exigirAdmin } from '../../lib/acceso.js';
import { json, leerJSON, manejar } from '../../lib/http.js';
import { crear, listar } from '../../lib/tienda.js';

export const GET = manejar(async (request) => {
  const todos = new URL(request.url).searchParams.get('todos') === '1';
  if (todos) await exigirAdmin(request);
  return json(200, await listar(todos));
});

export const POST = manejar(async (request) => {
  await exigirAdmin(request);
  return json(201, await crear(await leerJSON(request)));
});
