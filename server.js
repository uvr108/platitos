#!/usr/bin/env node
/**
 * Servidor local de la tienda Platitos. En Vercel no se usa: allí `public/` se sirve
 * como sitio estático y `api/` como funciones. Aquí se hace lo mismo con un solo proceso,
 * llamando a esas mismas funciones.
 *
 *     npm start                         # http://localhost:8000
 *     PORT=3000 npm start
 *     HOST=0.0.0.0 npm start            # visible desde otros equipos de la red
 *
 * Variables (archivo .env o entorno): ADMIN_PASSWORD; opcionales TURSO_DATABASE_URL y
 * TURSO_AUTH_TOKEN para usar la base de Turso en vez de data/tienda.db, y
 * BLOB_READ_WRITE_TOKEN para guardar fotos en Vercel Blob en vez de uploads/.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, STATUS_CODES } from 'node:http';
import { basename, extname, join, normalize, sep } from 'node:path';
import { Readable } from 'node:stream';
import { BASE } from './lib/db.js';
import { SUBIDAS } from './lib/fotos.js';
import { errorDemasiadoGrande, json, MAX_CUERPO } from './lib/http.js';

const PUBLICO = join(BASE, 'public');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

// Mismas rutas que arma Vercel a partir de los archivos de api/.
const RUTAS = [
  [/^\/api\/productos\/?$/, () => import('./api/productos/index.js')],
  [/^\/api\/productos\/\d+$/, () => import('./api/productos/[id].js')],
  [/^\/api\/sesion$/, () => import('./api/sesion.js')],
];

// --- API ----------------------------------------------------------------------

/** Cuerpo de la solicitud como stream web, cortado si supera el máximo que acepta Vercel. */
function cuerpoLimitado(req) {
  let total = 0;
  return Readable.toWeb(req).pipeThrough(new TransformStream({
    transform(parte, control) {
      total += parte.byteLength;
      if (total > MAX_CUERPO) control.error(errorDemasiadoGrande());
      else control.enqueue(parte);
    },
  }));
}

function aRequest(req) {
  const headers = new Headers();
  for (const [nombre, valor] of Object.entries(req.headers)) {
    if (valor !== undefined) headers.set(nombre, Array.isArray(valor) ? valor.join(', ') : valor);
  }
  // Como hace Vercel: la dirección del cliente la pone el servidor, no la solicitud.
  headers.set('x-forwarded-for', req.socket.remoteAddress ?? '');
  const conCuerpo = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
    method: req.method,
    headers,
    body: conCuerpo ? cuerpoLimitado(req) : undefined,
    duplex: 'half',
  });
}

async function enviar(res, response) {
  res.statusCode = response.status;
  for (const [nombre, valor] of response.headers) {
    if (nombre !== 'set-cookie') res.setHeader(nombre, valor);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function api(req, res, ruta) {
  const destino = RUTAS.find(([patron]) => patron.test(ruta));
  if (!destino) return enviar(res, json(404, { error: 'Ruta no encontrada.', campo: null }));
  const manejador = (await destino[1]())[req.method];
  if (!manejador) return enviar(res, json(405, { error: 'Método no permitido en esta ruta.', campo: null }));
  return enviar(res, await manejador(aRequest(req)));
}

// --- Archivos -------------------------------------------------------------------

function responderError(res, estado) {
  const mensaje = `${estado} ${STATUS_CODES[estado]}`;
  res.statusCode = estado;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(mensaje));
  res.end(mensaje);
}

async function servirArchivo(req, res, ruta) {
  if (ruta === '/admin' || ruta === '/admin/') ruta = '/admin.html';
  if (ruta.endsWith('/')) ruta += 'index.html';

  let archivo;
  if (ruta.startsWith('/uploads/')) {
    archivo = join(SUBIDAS, basename(ruta));
  } else {
    try {
      archivo = normalize(join(PUBLICO, decodeURIComponent(ruta)));
    } catch {
      return responderError(res, 400);
    }
    if (!archivo.startsWith(PUBLICO + sep)) return responderError(res, 404);
  }

  let info;
  try {
    info = await stat(archivo);
  } catch {
    return responderError(res, 404);
  }
  if (!info.isFile()) return responderError(res, 404); // sin listados de carpetas

  // no-cache: el navegador revalida y los cambios se ven al recargar.
  const modificado = info.mtime.toUTCString();
  res.setHeader('Last-Modified', modificado);
  res.setHeader('Cache-Control', 'no-cache');
  if (req.headers['if-modified-since'] === modificado) {
    res.statusCode = 304;
    return res.end();
  }
  res.setHeader('Content-Type', TIPOS[extname(archivo).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('Content-Length', info.size);
  if (req.method === 'HEAD') return res.end();
  createReadStream(archivo).on('error', () => res.destroy()).pipe(res);
}

// --- Servidor -------------------------------------------------------------------

const servidor = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.on('finish', () => console.log(`${req.method} ${req.url} ${res.statusCode}`));

  let ruta;
  try {
    ruta = new URL(req.url, 'http://localhost').pathname;
  } catch {
    return responderError(res, 400);
  }
  try {
    if (ruta.startsWith('/api/')) return await api(req, res, ruta);
    if (req.method !== 'GET' && req.method !== 'HEAD') return responderError(res, 405);
    await servirArchivo(req, res, ruta);
  } catch (error) {
    console.error('Error inesperado:', error);
    if (res.headersSent) res.destroy();
    else responderError(res, 500);
  }
});

const host = process.env.HOST ?? '127.0.0.1';
const puerto = Number(process.env.PORT ?? 8000);
servidor.listen(puerto, host, () => {
  console.log(`Tienda:         http://localhost:${puerto}`);
  console.log(`Administración: http://localhost:${puerto}/admin`);
  if (!process.env.ADMIN_PASSWORD) console.warn('Aviso: falta ADMIN_PASSWORD en .env; la administración queda desactivada.');
});

process.on('SIGINT', () => {
  console.log('\nServidor detenido.');
  servidor.close();
  process.exit(0);
});
