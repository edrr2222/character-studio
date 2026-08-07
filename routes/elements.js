const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const store = require('../lib/store');
const { upload, persistUploadedFile, UPLOADS_DIR } = require('../lib/upload');
const { uploadLimiter, adminAuth } = require('../lib/security');

const router = express.Router();

// GET /api/elements?categoryId=personas&slot=head
router.get('/', async (req, res) => {
  const { categoryId, slot } = req.query;
  const all = await store.filter(
    'elements',
    (e) => (!categoryId || e.categoryId === categoryId) && (!slot || e.slot === slot)
  );
  res.json(all);
});

// POST /api/elements  (multipart/form-data: image, categoryId, slot, offsetX, offsetY, rotation, scale, name)
router.post('/', adminAuth(), uploadLimiter, upload.single('image'), async (req, res) => {
  try {
    const category = await store.find('categories', (c) => c.id === req.body.categoryId);
    if (!category) {
      return res.status(404).json({ error: 'La categoría no existe. Créala primero.' });
    }
    if (!category.slots.includes(req.body.slot)) {
      return res.status(400).json({ error: `El slot "${req.body.slot}" no pertenece a "${category.id}".` });
    }

    // recién aquí, con req.body ya completo, validamos bytes reales y escribimos a disco
    const fullPath = persistUploadedFile(req);
    const relPath = path.relative(UPLOADS_DIR, fullPath).split(path.sep).join('/');

    const element = {
      id: uuidv4(),
      categoryId: req.body.categoryId,
      slot: req.body.slot,
      name: (req.body.name || '').toString().slice(0, 80) || relPath,
      imagePath: `/uploads/${relPath}`,
      // posición/transform base de este elemento sobre el lienzo de referencia de la categoría
      offsetX: Number(req.body.offsetX) || 0,
      offsetY: Number(req.body.offsetY) || 0,
      rotation: Number(req.body.rotation) || 0,
      scale: Number(req.body.scale) || 1,
      createdAt: new Date().toISOString(),
    };
    await store.insert('elements', element);
    res.status(201).json(element);
  } catch (e) {
    // con memoryStorage, si persistUploadedFile() lanza error, nunca llegó a escribirse nada
    // a disco -> no hay archivo huérfano que limpiar.
    res.status(e.status || 400).json({ error: e.message });
  }
});

// PUT /api/elements/:id  (ajustar posicionamiento sin volver a subir imagen)
router.put('/:id', adminAuth(), async (req, res) => {
  const patch = {};
  ['offsetX', 'offsetY', 'rotation', 'scale'].forEach((k) => {
    if (req.body[k] !== undefined) patch[k] = Number(req.body[k]);
  });
  if (req.body.name) patch.name = String(req.body.name).slice(0, 80);
  const updated = await store.update('elements', req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'Elemento no encontrado.' });
  res.json(updated);
});

router.delete('/:id', adminAuth(), async (req, res) => {
  const el = await store.find('elements', (e) => e.id === req.params.id);
  if (el) {
    const abs = path.join(UPLOADS_DIR, el.imagePath.replace('/uploads/', ''));
    fs.unlink(abs, () => {}); // best-effort, no bloquea si ya no existe
  }
  await store.remove('elements', req.params.id);
  res.status(204).end();
});

module.exports = router;
