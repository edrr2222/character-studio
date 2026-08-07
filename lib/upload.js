/**
 * Reglas de seguridad para subida de imágenes de assets:
 *  1. Solo PNG y WEBP (con fondo transparente tiene sentido; SVG queda excluido a propósito
 *     porque un SVG puede contener <script>, y no queremos ejecutar nada subido por un usuario).
 *  2. El nombre de archivo en disco lo genera el servidor (uuid), nunca se usa el nombre original
 *     -> evita path traversal ("../../server.js") y sobrescritura de archivos.
 *  3. category y slot (usados para el nombre de carpeta) se validan con una lista blanca de
 *     caracteres antes de tocar el filesystem.
 *  4. Límite de tamaño (2MB) y límite de 1 archivo por request.
 *  5. Se valida el mimetype declarado por el navegador Y la firma real de los primeros bytes del
 *     archivo (un atacante puede mentir el mimetype, no puede mentir los bytes reales sin romper
 *     la imagen).
 *  6. Los archivos servidos desde /uploads se sirven SOLO como estáticos, nunca se interpretan ni
 *     ejecutan (ver server.js: express.static + header X-Content-Type-Options: nosniff).
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const SAFE_NAME = /^[a-zA-Z0-9_-]{1,40}$/;

const ALLOWED = {
  'image/png': { ext: '.png', check: isPng },
  'image/webp': { ext: '.webp', check: isWebp },
};

function isPng(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return buf.slice(0, 8).equals(sig);
}
function isWebp(buf) {
  return buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
}

function assertSafeSegment(value, label) {
  if (typeof value !== 'string' || !SAFE_NAME.test(value)) {
    const err = new Error(`${label} inválido: solo letras, números, "-" y "_" (máx 40 caracteres)`);
    err.status = 400;
    throw err;
  }
}

// IMPORTANTE: usamos memoryStorage (no diskStorage) a propósito. Con multipart/form-data el
// archivo puede llegar ANTES que los campos de texto (categoryId, slot) en el stream, y
// diskStorage.destination() se ejecuta en streaming, cuando esos campos todavía no están
// parseados -> escribiría en la carpeta equivocada o fallaría según el orden en que el
// cliente arme el formulario. Guardando en memoria primero, escribimos a disco nosotros
// mismos ya en el route handler, con req.body 100% completo y sin depender del orden.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE, files: 1 },
  fileFilter(req, file, cb) {
    if (!ALLOWED[file.mimetype]) {
      return cb(new Error('Formato no permitido. Solo PNG o WEBP.'));
    }
    cb(null, true);
  },
});

// Se llama DESPUÉS de multer, cuando req.body y req.file (en memoria) ya están completos.
// Valida la firma real de bytes, valida categoryId/slot, y recién ahí escribe a disco con un
// nombre generado por el servidor.
function persistUploadedFile(req) {
  if (!req.file) {
    const err = new Error('Falta el archivo "image".');
    err.status = 400;
    throw err;
  }
  const meta = ALLOWED[req.file.mimetype];
  if (!meta || !meta.check(req.file.buffer.slice(0, 16))) {
    const err = new Error('El archivo no es una imagen válida (firma de bytes no coincide).');
    err.status = 400;
    throw err;
  }
  assertSafeSegment(req.body.categoryId, 'categoryId');
  assertSafeSegment(req.body.slot, 'slot');

  const dir = path.join(UPLOADS_DIR, req.body.categoryId, req.body.slot);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${uuidv4()}${meta.ext}`;
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, req.file.buffer);
  return fullPath;
}

module.exports = { upload, persistUploadedFile, UPLOADS_DIR, assertSafeSegment };
