const basicAuth = require('express-basic-auth');
const rateLimit = require('express-rate-limit');

// Auth del panel admin: usuario/clave desde variables de entorno (Render → Environment).
// Nunca hardcodear credenciales en el repo.
function adminAuth() {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) {
    console.warn(
      '⚠️  ADMIN_USER / ADMIN_PASSWORD no configuradas: el panel admin queda BLOQUEADO por defecto ' +
        '(fail-closed) hasta que las definas como variables de entorno.'
    );
    return (req, res) => res.status(503).send('Admin no configurado: falta ADMIN_USER/ADMIN_PASSWORD.');
  }
  return basicAuth({
    users: { [user]: pass },
    challenge: true,
    realm: 'character-studio-admin',
  });
}

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20, // subir imágenes es más costoso, límite más estricto
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { adminAuth, apiLimiter, uploadLimiter };
