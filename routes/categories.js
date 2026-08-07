const express = require('express');
const { v4: uuidv4 } = require('uuid');
const store = require('../lib/store');
const { assertSafeSegment } = require('../lib/upload');
const { adminAuth } = require('../lib/security');

const router = express.Router();

// GET /api/categories -> lista todas (personas, carros, ...)
router.get('/', async (req, res) => {
  res.json(await store.list('categories'));
});

// POST /api/categories { id, name, slots: ["body","jacket","head","hat","glasses"], refWidth, refHeight }
router.post('/', adminAuth(), async (req, res) => {
  try {
    const { name, slots, refWidth, refHeight } = req.body;
    if (!name || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ error: 'Falta "name" o "slots" (arreglo no vacío).' });
    }
    const id = String(name).toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-').slice(0, 40);
    assertSafeSegment(id, 'id de categoría (derivado del nombre)');
    slots.forEach((s) => assertSafeSegment(s, `slot "${s}"`));

    const existing = await store.find('categories', (c) => c.id === id);
    if (existing) return res.status(409).json({ error: `Ya existe la categoría "${id}".` });

    const category = {
      id,
      name: String(name).trim(),
      slots, // orden = orden de dibujo (atrás -> adelante)
      refWidth: Number(refWidth) || 220,
      refHeight: Number(refHeight) || 220,
      createdAt: new Date().toISOString(),
    };
    await store.insert('categories', category);
    res.status(201).json(category);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

// PUT /api/categories/:id  (reordenar slots, renombrar, cambiar tamaño de referencia)
router.put('/:id', adminAuth(), async (req, res) => {
  const patch = {};
  if (req.body.slots) {
    req.body.slots.forEach((s) => assertSafeSegment(s, `slot "${s}"`));
    patch.slots = req.body.slots;
  }
  if (req.body.name) patch.name = String(req.body.name).trim();
  if (req.body.refWidth) patch.refWidth = Number(req.body.refWidth);
  if (req.body.refHeight) patch.refHeight = Number(req.body.refHeight);
  const updated = await store.update('categories', req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'Categoría no encontrada.' });
  res.json(updated);
});

router.delete('/:id', adminAuth(), async (req, res) => {
  await store.remove('categories', req.params.id);
  res.status(204).end();
});

module.exports = router;
