# Platitos

Tienda de alimento para perros y gatos: catálogo público y panel para administrar productos. Funciona en Vercel (funciones + Turso + Vercel Blob) y también en tu equipo con un servidor Node local.

## En tu equipo

Necesita Node 24 LTS.

```bash
npm install
npm start
```

- Tienda: http://localhost:8000
- Administración: http://localhost:8000/admin

Con `npm run dev` el servidor se reinicia solo al guardar cambios.

En local, la base es el archivo `data/tienda.db` y las fotos van a `uploads/`. La primera vez se cargan 20 productos de muestra (uno pausado). Para empezar de cero, detén el servidor y borra `data/`.

## Desplegar en Vercel

1. **Sube el proyecto a GitHub.** Crea un repositorio vacío y sube la rama `main` (ver más abajo).
2. **Importa el repositorio en Vercel** (Add New → Project). El preset es *Other*, sin comando de build; `vercel.json` ya indica que el sitio estático está en `public/`.
3. **Crea la base:** en el proyecto, Storage → Create → **Turso** y conéctala al proyecto. Eso agrega `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`.
4. **Crea el almacenamiento de fotos:** Storage → Create → **Blob** y conéctalo. Eso agrega `BLOB_READ_WRITE_TOKEN`.
5. **Define la contraseña:** Settings → Environment Variables → `ADMIN_PASSWORD`.
6. **Vuelve a desplegar** (Deployments → Redeploy) para que las funciones lean las variables nuevas.

La primera visita crea las tablas en Turso y carga los productos de muestra. Si a la tienda le falta alguna variable, la API responde con un mensaje que dice cuál configurar.

Si la integración de Turso nombra distinto sus variables, crea a mano `TURSO_DATABASE_URL` (la dirección `libsql://…`) y `TURSO_AUTH_TOKEN`.

### Subir a GitHub

```bash
git remote add origin git@github.com:TU-USUARIO/platitos.git
git push -u origin main
```

Desde ahí, cada `git push` a `main` vuelve a desplegar la tienda.

## Qué hace

**Tienda** (`/`): la frase del encabezado es el filtro. «Busco *alimento seco* para *gatos* *en crecimiento*» filtra por tipo de producto, mascota y etapa de vida. Los productos para «perro y gato» y los de «todas las etapas» aparecen en cualquier filtro que los incluya. Los resultados se agrupan por tipo, y la URL guarda el filtro (por ejemplo, `/?mascota=gato&etapa=cachorro`) para poder compartirla.

**Administración** (`/admin`), con contraseña:

- **Subir producto**: foto, nombre, descripción breve (hasta 160 caracteres), precio, presentación, mascota, etapa y tipo. La foto se reduce en el navegador a 1200 px como máximo antes de enviarla.
- **Editar**: cambia cualquier campo, incluida la foto (la anterior se borra).
- **Pausar / Reanudar**: oculta el producto de la tienda sin borrarlo.
- **Eliminar**: lo borra de forma definitiva junto con su foto, previa confirmación.

## Contraseña de administración

Se define con la variable `ADMIN_PASSWORD`: en Vercel, en Environment Variables; en tu equipo, en el archivo `.env` (plantilla en `.env.example`; `.env` no se sube a git). Si falta, la tienda funciona igual pero la administración queda desactivada.

- La sesión dura 12 horas o hasta que se use «Cerrar sesión». Se guarda en la base, así que sobrevive a reinicios y despliegues.
- Tras 5 contraseñas incorrectas desde la misma dirección, el ingreso se bloquea 15 minutos.
- Al cambiar la contraseña, las sesiones abiertas siguen valiendo hasta que expiren. Para cerrarlas todas, borra las filas de la tabla `sesiones`.

## Estructura

```
api/                     funciones de Vercel (Request/Response estándar)
  productos/index.js     GET lista, POST crear
  productos/[id].js      GET, PATCH, DELETE
  sesion.js              GET estado, POST iniciar, DELETE cerrar
lib/
  db.js                  conexión (Turso o data/tienda.db) y tablas
  tienda.js              validación, productos y carga de muestras
  fotos.js               fotos en Vercel Blob o en uploads/
  acceso.js              contraseña, sesiones y bloqueo por intentos
  http.js                respuestas JSON, lectura del cuerpo y errores
public/                  sitio estático (tienda, administración, estilos, imágenes)
server.js                servidor local: sirve public/ y llama a las mismas funciones de api/
seed.js                  productos de muestra
vercel.json              configuración del despliegue
.env.example             variables necesarias
```

## API

| Método | Ruta | Sesión | Uso |
| --- | --- | --- | --- |
| GET | `/api/sesion` | | `{"admin": true/false, "configurada": true/false}` |
| POST | `/api/sesion` | | Inicia sesión con `{"clave": "..."}`; deja una cookie HttpOnly |
| DELETE | `/api/sesion` | | Cierra la sesión |
| GET | `/api/productos` | | Productos visibles en la tienda |
| GET | `/api/productos?todos=1` | Sí | Todos, incluidos los pausados |
| GET | `/api/productos/<id>` | | Un producto (los pausados solo con sesión) |
| POST | `/api/productos` | Sí | Crear (JSON; la foto va como data URL JPG, PNG o WebP) |
| PATCH | `/api/productos/<id>` | Sí | Modificar campos sueltos; `{"activo": false}` lo pausa |
| DELETE | `/api/productos/<id>` | Sí | Eliminar |

Los errores responden `{"error": "mensaje", "campo": "nombre_del_campo"}`. Sin sesión, las rutas protegidas responden 401. Cada solicitud admite hasta 4 MB (Vercel acepta 4,5 MB).

## Ajustes

- **Moneda**: `MONEDA` en `public/js/comun.js` (por defecto pesos chilenos).
- **Puerto y dirección en local**: `PORT=3000 npm start`; `HOST=0.0.0.0 npm start` para abrirlo a la red local.

## Antes de abrirla al público

- **Usa una contraseña larga.** Una palabra corta o un nombre se adivina rápido aunque haya bloqueo por intentos.
- Vercel sirve todo por HTTPS, y la cookie de sesión se marca `Secure` allí.
# platitos
