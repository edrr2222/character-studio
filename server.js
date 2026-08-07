require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');

const store = require('./lib/store');
const { adminAuth, apiLimiter } = require('./lib/security');
const { UPLOADS_DIR } = require('./lib/upload');

const categoriesRoutes = require('./routes/categories');
const elementsRoutes = require('./routes/elements');
const animationsRoutes = require('./routes/animations');
const publicRoutes = require('./routes/public');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Preparar carpetas/archivos de datos ---
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
['categories', 'elements', 'animations'].forEach((t) => store.ensureFile(t));

// --- Seguridad base ---
app.use(
  helmet({
    // permite <img>/canvas cargando imágenes propias sin pelear con CSP en esta demo;
    // si sirves el admin y el visor en dominios distintos, ajusta esto.
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || true, // en producción: pon el dominio exacto de Render aquí
  })
);
app.use(express.json({ limit: '256kb' })); // los JSON de animaciones no necesitan más
app.use('/api', apiLimiter);

// --- Estáticos ---
// Uploads: SOLO servidos como archivos estáticos (nunca ejecutados). nosniff evita que el
// navegador intente "adivinar" un tipo de contenido distinto al declarado.
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  },
  express.static(UPLOADS_DIR, { fallthrough: false, dotfiles: 'deny', index: false })
);

app.use('/viewer', express.static(path.join(__dirname, 'public', 'viewer')));
app.use('/shared', express.static(path.join(__dirname, 'public', 'shared')));

// Admin protegido con auth básica (usuario/clave por variables de entorno, ver lib/security.js)
app.use('/admin', adminAuth(), express.static(path.join(__dirname, 'public', 'admin')));

// --- API ---
// Nota: dentro de cada router, las rutas de escritura (POST/PUT/DELETE) están protegidas
// individualmente con adminAuth (ver routes/categories.js, elements.js, animations.js).
// Las de lectura (GET) quedan públicas porque el visor final las necesita sin login.
app.use('/api/categories', categoriesRoutes);
app.use('/api/elements', elementsRoutes);
app.use('/api/animations', animationsRoutes);
app.use('/api', publicRoutes); // /api/random -> público, lo usa el visor final

app.get('/', (req, res) => res.redirect('/viewer'));

// Manejo de errores centralizado (evita que un throw tumbe el proceso o filtre stack traces)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno.' });
});

app.listen(PORT, () => {
  console.log(`✓ character-studio corriendo en http://localhost:${PORT}`);
  console.log(`  Admin:  http://localhost:${PORT}/admin`);
  console.log(`  Visor:  http://localhost:${PORT}/viewer`);
});
