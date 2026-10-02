// Fotos de productos: Vercel Blob cuando hay BLOB_READ_WRITE_TOKEN; si no, la carpeta uploads/.
import { del, put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { BASE } from './db.js';
import { ErrorCliente } from './http.js';

export const SUBIDAS = join(BASE, 'uploads');

const MAX_FOTO = 3 * 1024 * 1024;
const DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,(.+)$/s;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const TIPOS = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const usaBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const esBlob = (ruta) => {
  try {
    return new URL(ruta).hostname.endsWith('.blob.vercel-storage.com');
  } catch {
    return false;
  }
};

/** Guarda una foto enviada como data URL y devuelve su dirección pública. */
export async function guardarFoto(dataUrl) {
  const m = typeof dataUrl === 'string' && DATA_URL.exec(dataUrl);
  if (!m) throw new ErrorCliente('La foto debe ser JPG, PNG o WebP.', 'foto');
  if (m[1].length % 4 !== 0 || !BASE64.test(m[1])) {
    throw new ErrorCliente('No se pudo leer la foto. Elige otra imagen.', 'foto');
  }
  const datos = Buffer.from(m[1], 'base64');
  if (datos.length > MAX_FOTO) throw new ErrorCliente('La foto pesa más de 3 MB. Elige una más liviana.', 'foto');

  let ext;
  if (datos[0] === 0xff && datos[1] === 0xd8 && datos[2] === 0xff) ext = 'jpg';
  else if (datos.subarray(0, 8).equals(Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'))) ext = 'png';
  else if (datos.toString('latin1', 0, 4) === 'RIFF' && datos.toString('latin1', 8, 12) === 'WEBP') ext = 'webp';
  else throw new ErrorCliente('El archivo no es una imagen JPG, PNG o WebP válida.', 'foto');

  const nombre = `${randomUUID().replaceAll('-', '')}.${ext}`;
  if (usaBlob()) {
    const { url } = await put(`productos/${nombre}`, datos, { access: 'public', contentType: TIPOS[ext] });
    return url;
  }
  if (process.env.VERCEL) {
    throw new ErrorCliente('Falta configurar Vercel Blob para guardar fotos: conecta un Blob store al proyecto.', 'foto', 503);
  }
  mkdirSync(SUBIDAS, { recursive: true });
  await writeFile(join(SUBIDAS, nombre), datos);
  return `/uploads/${nombre}`;
}

/** Borra una foto subida. Las ilustraciones de muestra no se tocan. */
export async function borrarFoto(ruta) {
  if (!ruta) return;
  if (ruta.startsWith('/uploads/')) {
    await unlink(join(SUBIDAS, basename(ruta))).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  } else if (esBlob(ruta) && usaBlob()) {
    await del(ruta);
  }
}
