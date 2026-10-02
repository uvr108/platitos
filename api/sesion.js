// GET /api/sesion (estado), POST (inicia sesión con { clave }) y DELETE (cierra sesión).
import { cerrarSesion, estadoSesion, iniciarSesion } from '../lib/acceso.js';
import { manejar } from '../lib/http.js';

export const GET = manejar(estadoSesion);
export const POST = manejar(iniciarSesion);
export const DELETE = manejar(cerrarSesion);
