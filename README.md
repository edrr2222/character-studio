# Character Studio

Sistema para crear personajes 2D por capas: un **panel admin** donde tu diseñadora sube y posiciona
assets (cuerpo, chaqueta, cabeza, gorro, gafas, o lo que definas para otros grupos como "carros"),
les asigna **animaciones tipo marioneta** (mover/rotar/escalar cada capa con keyframes, sin sprite-sheets),
y un **visor público** donde el usuario final recibe un personaje aleatorio y lo mueve con WASD.

Todo se guarda en **JSON plano** (sin motor de base de datos) + las imágenes en carpetas normales
dentro de `uploads/`.

## Estructura

```
server.js              punto de entrada (Express)
lib/
  store.js             "base de datos" en JSON plano (lectura/escritura atómica y en cola)
  upload.js             validación segura de imágenes subidas
  security.js           auth del admin + rate limiting
routes/
  categories.js          CRUD de categorías (personas, carros...) y sus slots/capas
  elements.js             subir imagen + guardar posición/rotación/escala de cada elemento
  animations.js            clips de animación (keyframes) por categoría y estado
  public.js                 GET /api/random -> arma un personaje al azar (lo usa el visor)
data/                    categories.json, elements.json, animations.json (se crean solos)
uploads/                 imágenes subidas, organizadas como uploads/<categoria>/<slot>/archivo.png
public/
  admin/                  panel para la diseñadora (protegido con usuario/clave)
  viewer/                  visor público, movimiento WASD
  shared/engine.js          motor de animación que usan AMBOS (mismo código en admin y visor)
```

## Cómo funciona el sistema de capas

1. Se crea una **categoría** (ej. `personas`) con sus **slots** en orden de dibujo, de atrás hacia
   adelante (ej. `body, jacket, head, hat, glasses`).
2. La diseñadora sube imágenes PNG/WEBP con fondo transparente para cada slot. Todas las imágenes de
   una categoría comparten el mismo lienzo de referencia (`refWidth` × `refHeight`), así encajan sin
   ajustar posiciones a mano imagen por imagen.
3. Cada imagen se **posiciona una sola vez** (offset X/Y, rotación, escala) arrastrándola sobre el
   lienzo de referencia en el admin. Esa posición queda fija para siempre, sin importar qué otras
   capas le toquen al personaje al azar.
4. Al generar un personaje, el sistema elige **una imagen al azar por slot** y las dibuja apiladas en
   ese orden — el "montaje" que pedías.

## Cómo funcionan las animaciones (sin sprite-sheets)

Cada capa tiene una posición **base** (la que la diseñadora fijó al posicionarla). Una animación es
una lista de **keyframes por slot**: en vez de dibujar otra imagen, se le suma un desplazamiento/
rotación/escala a esa posición base a lo largo del tiempo:

```json
{
  "categoryId": "personas",
  "state": "idle",
  "duration": 1200,
  "loop": true,
  "tracks": {
    "head": [
      { "t": 0,    "dy": 0  },
      { "t": 600,  "dy": -3 },
      { "t": 1200, "dy": 0  }
    ]
  }
}
```

Esto hace que la cabeza "respire" subiendo y bajando 3px cada 1.2s, en bucle. `state` es libre —
puedes usar `idle`, `walk`, `talk`, o el nombre que quieras para más adelante cuando agregues diálogos:
el visor simplemente pide el clip del estado que le interese en cada momento.

## Correr en local

```bash
npm install
cp .env.example .env     # y edita ADMIN_USER / ADMIN_PASSWORD ahí
npm start
```

- Admin: http://localhost:3000/admin (pide usuario/clave)
- Visor: http://localhost:3000/viewer (público)

## Desplegar en Render

1. Sube este proyecto a un repositorio de GitHub.
2. En Render: **New → Web Service**, conecta el repo.
   - Build command: `npm install`
   - Start command: `npm start`
3. En **Environment**, agrega `ADMIN_USER`, `ADMIN_PASSWORD` y, cuando conozcas la URL final,
   `ALLOWED_ORIGIN=https://tu-app.onrender.com`.
4. **Importante — persistencia de archivos**: el disco de un Web Service de Render normal es
   **efímero** (se borra en cada redeploy o reinicio). Como aquí guardamos imágenes y JSON en disco,
   necesitas agregar un **Persistent Disk** desde la pestaña "Disks" del servicio, montado en la
   raíz del proyecto (o específicamente en `./data` y `./uploads`) — disponible desde el plan
   Starter en adelante, no en el free tier. Sin esto, cada vez que Render reinicie el servicio
   (duerme por inactividad en el free tier, o haces un deploy) **perderás todo lo subido**.
   Alternativa si prefieres quedarte en free tier: mover `uploads/` a un bucket S3/Cloudflare R2
   más adelante — el código ya aísla toda la lógica de guardado en `lib/upload.js`, así que sería
   el único archivo a tocar.

## Seguridad ya implementada

- El panel `/admin` y todas las rutas de escritura de la API (`POST`/`PUT`/`DELETE`) exigen
  usuario/clave (autenticación básica). Si no defines `ADMIN_USER`/`ADMIN_PASSWORD`, el admin queda
  **bloqueado por defecto**, no abierto.
- Las subidas se validan por **firma real de bytes** del archivo (no solo por extensión o por el
  Content-Type que mande el navegador, que se puede falsificar), y se limitan a PNG/WEBP — nunca SVG
  (un SVG puede contener `<script>`) ni ningún tipo ejecutable.
- El nombre de archivo en disco lo genera siempre el servidor (UUID); el nombre original del archivo
  del usuario nunca se usa para construir rutas, evitando path traversal.
- Los nombres de categoría/slot que sí se usan para nombrar carpetas pasan por una lista blanca de
  caracteres antes de tocar el filesystem.
- Límite de tamaño por imagen (2MB) y rate limiting: 20 subidas/min y 120 requests/min a la API.
- Las imágenes en `/uploads` se sirven solo como archivos estáticos, nunca se interpretan ni
  ejecutan (`X-Content-Type-Options: nosniff`).
- Cabeceras de seguridad generales vía Helmet, CORS restringible a tu dominio real en producción.

## Flujo de trabajo para la diseñadora

1. **Categorías** → crea el grupo (ej. "personas") y sus capas en orden.
2. **Elementos** → sube cada imagen (elige categoría + slot), luego en "Posicionar elemento" la
   arrastra sobre el lienzo hasta que quede en el lugar correcto, ajusta rotación/escala, guarda.
3. **Animaciones** → elige categoría y escribe el nombre del estado (`idle`, `walk`, `talk`...),
   agrega keyframes por capa, dale a "Previsualizar" para verlo en vivo antes de guardar.
4. **Vista previa** → genera personajes al azar tal como los vería el usuario final, para revisar
   que todo combine bien.

## Extender el sistema

- **Otro grupo de personajes (ej. "carros")**: solo crea una nueva categoría con sus propios slots
  (`chasis, llantas, spoiler, pintura...`) — el resto del sistema (subida, posicionamiento,
  animación, generación aleatoria) ya funciona igual para cualquier categoría.
- **Diálogos más adelante**: como los estados de animación son libres, puedes crear un estado
  `talk` (o `talk_feliz`, `talk_enojado`, etc.) y hacer que tu lógica de diálogo le pida al visor
  ese estado específico vía `GET /api/random?categoryId=personas&state=talk_feliz` — el motor de
  animación (`public/shared/engine.js`) ya soporta cualquier nombre de estado sin cambios de código.
