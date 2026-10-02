// Contraseña de administración (ADMIN_PASSWORD), sesiones con cookie y bloqueo por intentos.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db, esquemaListo } from './db.js';
import { ErrorCliente, json, leerJSON } from './http.js';

const COOKIE = 'platitos_sesion';
const DURACION_SESION = 12 * 60 * 60 * 1000;
const MAX_INTENTOS = 5;
const VENTANA_INTENTOS = 15 * 60 * 1000;

const clave = () => process.env.ADMIN_PASSWORD ?? '';
const huella = (texto) => createHash('sha256').update(texto).digest();
const huellaHex = (texto) => huella(texto).toString('hex');

// Compara huellas de igual largo en tiempo constante para no filtrar la contraseña por tiempos.
const claveCorrecta = (intento) => timingSafeEqual(huella(intento), huella(clave()));

function leerCookie(request) {
  for (const parte of (request.headers.get('cookie') ?? '').split(';')) {
    const [nombre, ...valor] = parte.trim().split('=');
    if (nombre === COOKIE) return valor.join('=');
  }
  return null;
}

function cookieSesion(request, valor, segundos) {
  const segura = new URL(request.url).protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  return `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${segundos}${segura ? '; Secure' : ''}`;
}

// En Vercel la primera dirección de x-forwarded-for la pone la plataforma; en local, server.js.
const ipDe = (request) => (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'desconocida';

export async function esAdmin(request) {
  const token = leerCookie(request);
  if (!token || !clave()) return false;
  await esquemaListo();
  const { rows } = await db.execute({ sql: 'SELECT expira FROM sesiones WHERE token = ?', args: [huellaHex(token)] });
  return Boolean(rows[0] && Number(rows[0].expira) > Date.now());
}

/** Se revisa antes de leer el cuerpo: sin sesión no se acepta ninguna foto. */
export async function exigirAdmin(request) {
  if (!(await esAdmin(request))) {
    throw new ErrorCliente('Ingresa la contraseña de administración para continuar.', null, 401);
  }
}

async function revisarIntentos(ip) {
  await db.execute({ sql: 'DELETE FROM intentos WHERE ip = ? AND desde < ?', args: [ip, Date.now() - VENTANA_INTENTOS] });
  const { rows } = await db.execute({ sql: 'SELECT fallos, desde FROM intentos WHERE ip = ?', args: [ip] });
  if (rows[0] && Number(rows[0].fallos) >= MAX_INTENTOS) {
    const minutos = Math.ceil((Number(rows[0].desde) + VENTANA_INTENTOS - Date.now()) / 60000);
    throw new ErrorCliente(
      `Demasiados intentos fallidos. Espera ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} e inténtalo de nuevo.`,
      'clave', 429);
  }
}

const registrarFallo = (ip) => db.execute({
  sql: 'INSERT INTO intentos (ip, fallos, desde) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET fallos = fallos + 1',
  args: [ip, Date.now()],
});

export async function estadoSesion(request) {
  return json(200, { admin: await esAdmin(request), configurada: Boolean(clave()) });
}

export async function iniciarSesion(request) {
  if (!clave()) {
    throw new ErrorCliente('La administración está desactivada: falta definir ADMIN_PASSWORD.', null, 503);
  }
  await esquemaListo();
  const ip = ipDe(request);
  await revisarIntentos(ip);
  const intento = (await leerJSON(request))?.clave;
  if (typeof intento !== 'string' || !claveCorrecta(intento)) {
    await registrarFallo(ip);
    throw new ErrorCliente('Contraseña incorrecta.', 'clave', 401);
  }
  const token = randomBytes(32).toString('base64url');
  await db.batch([
    { sql: 'DELETE FROM intentos WHERE ip = ?', args: [ip] },
    { sql: 'DELETE FROM sesiones WHERE expira < ?', args: [Date.now()] },
    { sql: 'INSERT INTO sesiones (token, expira) VALUES (?, ?)', args: [huellaHex(token), Date.now() + DURACION_SESION] },
  ], 'write');
  return json(204, undefined, { 'Set-Cookie': cookieSesion(request, token, DURACION_SESION / 1000) });
}

export async function cerrarSesion(request) {
  const token = leerCookie(request);
  if (token) {
    await esquemaListo();
    await db.execute({ sql: 'DELETE FROM sesiones WHERE token = ?', args: [huellaHex(token)] });
  }
  return json(204, undefined, { 'Set-Cookie': cookieSesion(request, '', 0) });
}
