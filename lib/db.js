// Conexión a la base: Turso en Vercel (TURSO_DATABASE_URL) o el archivo
// data/tienda.db en tu equipo. Las dos hablan SQLite.
import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErrorCliente } from './http.js';

export const BASE = join(dirname(fileURLToPath(import.meta.url)), '..');

// Las variables ya definidas en el entorno tienen prioridad sobre el archivo .env.
try {
  process.loadEnvFile(join(BASE, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

export const MASCOTAS = ['perro', 'gato', 'ambos'];
export const ETAPAS = ['cachorro', 'adulto', 'senior', 'todas'];
export const CATEGORIAS = ['seco', 'humedo', 'natural', 'snack', 'suplemento'];

const archivoLocal = join(BASE, 'data', 'tienda.db');
const url = process.env.TURSO_DATABASE_URL || `file:${archivoLocal}`;
const enVercelSinBase = Boolean(process.env.VERCEL) && !process.env.TURSO_DATABASE_URL;
if (url.startsWith('file:') && !enVercelSinBase) mkdirSync(dirname(archivoLocal), { recursive: true });

export const db = enVercelSinBase ? null : createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

/** Filas de un resultado como objetos simples. */
export const filas = (resultado) =>
  resultado.rows.map((fila) => Object.fromEntries(resultado.columns.map((c, i) => [c, fila[i]])));

// UTC con segundos (2026-10-01T00:39:18+00:00): todas las filas usan este formato para ordenar por fecha.
export const ahora = () => new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');

const enSQL = (valores) => valores.map((v) => `'${v}'`).join(', ');

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS productos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre       TEXT    NOT NULL,
    descripcion  TEXT    NOT NULL,
    precio       REAL    NOT NULL CHECK (precio > 0),
    presentacion TEXT    NOT NULL DEFAULT '',
    mascota      TEXT    NOT NULL CHECK (mascota IN (${enSQL(MASCOTAS)})),
    etapa        TEXT    NOT NULL CHECK (etapa IN (${enSQL(ETAPAS)})),
    categoria    TEXT    NOT NULL CHECK (categoria IN (${enSQL(CATEGORIAS)})),
    foto         TEXT    NOT NULL,
    activo       INTEGER NOT NULL DEFAULT 1,
    creado       TEXT    NOT NULL,
    actualizado  TEXT    NOT NULL
  )`,
  // Se guarda la huella (SHA-256) del token; el token solo vive en la cookie del navegador.
  `CREATE TABLE IF NOT EXISTS sesiones (
    token   TEXT    PRIMARY KEY,
    expira  INTEGER NOT NULL
  )`,
  // Fallos de contraseña por IP. Va en la base porque las funciones de Vercel no comparten memoria.
  `CREATE TABLE IF NOT EXISTS intentos (
    ip      TEXT    PRIMARY KEY,
    fallos  INTEGER NOT NULL,
    desde   INTEGER NOT NULL
  )`,
  // Marca que los productos de muestra ya se cargaron una vez.
  `CREATE TABLE IF NOT EXISTS meta (
    clave   TEXT    PRIMARY KEY
  )`,
];

let esquema;

/** Crea las tablas una vez por instancia. */
export function esquemaListo() {
  if (!db) {
    return Promise.reject(new ErrorCliente(
      'Falta configurar la base de datos: define TURSO_DATABASE_URL y TURSO_AUTH_TOKEN en Vercel.', null, 503));
  }
  esquema ??= db.batch(ESQUEMA, 'write').catch((error) => {
    esquema = undefined;
    throw error;
  });
  return esquema;
}
