// Utilidades HTTP con Request/Response estándar: las usan las funciones de Vercel
// (api/) y el servidor local (server.js) por igual.

// Vercel acepta hasta 4,5 MB por solicitud; las fotos llegan reducidas en el navegador.
const MAX_CUERPO = 4 * 1024 * 1024;

export class ErrorCliente extends Error {
  constructor(mensaje, campo = null, estado = 400) {
    super(mensaje);
    this.campo = campo;
    this.estado = estado;
  }
}

export const errorDemasiadoGrande = () =>
  new ErrorCliente('La solicitud es demasiado grande. Usa una foto más liviana.', 'foto', 413);

export function json(estado, cuerpo, encabezados = {}) {
  const headers = new Headers({ 'Cache-Control': 'no-store', ...encabezados });
  if (cuerpo !== undefined) headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status: estado, headers });
}

export async function leerJSON(request) {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_CUERPO) throw errorDemasiadoGrande();
  let bytes;
  try {
    bytes = await request.arrayBuffer();
  } catch (error) {
    const causa = error instanceof ErrorCliente ? error : error?.cause;
    if (causa instanceof ErrorCliente) throw causa;
    throw new ErrorCliente('No se pudo leer la solicitud. Inténtalo de nuevo.');
  }
  if (bytes.byteLength > MAX_CUERPO) throw errorDemasiadoGrande();
  try {
    const texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(texto || '{}');
  } catch {
    throw new ErrorCliente('El cuerpo de la solicitud no es JSON válido.');
  }
}

export { MAX_CUERPO };

/** Rechaza escrituras enviadas desde páginas de otro sitio. */
function origenValido(request) {
  const origen = request.headers.get('origin');
  if (!origen) return true;
  try {
    return new URL(origen).host === request.headers.get('host');
  } catch {
    return false;
  }
}

/** Envuelve un manejador: revisa el origen y convierte los errores en respuestas JSON. */
export function manejar(fn) {
  return async (request) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD' && !origenValido(request)) {
        throw new ErrorCliente('Solicitud rechazada: viene de otro sitio.', null, 403);
      }
      return await fn(request);
    } catch (error) {
      if (error instanceof ErrorCliente) return json(error.estado, { error: error.message, campo: error.campo });
      // El cliente recibe un mensaje claro y el detalle queda en el registro.
      console.error('Error inesperado:', error);
      return json(500, { error: 'Ocurrió un error en el servidor. Revisa el registro e inténtalo de nuevo.', campo: null });
    }
  };
}
