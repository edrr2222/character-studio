const express = require('express');
const { v4: uuidv4 } = require('uuid');
const store = require('../lib/store');
const { assertSafeSegment } = require('../lib/upload');
const { adminAuth } = require('../lib/security');

const router = express.Router();

/**
 * Un "clip" de animación pertenece a una categoría y a un estado (idle, walk, talk, o cualquier
 * nombre custom que la editora quiera para más adelante con diálogos).
 * Dentro del clip, `tracks` tiene una lista de keyframes por slot:
 *   tracks: {
 *     head:  [{ t:0, x:0, y:0, rot:0, scale:1, opacity:1 }, { t:400, y:-4, ... }, ...],
 *     hat:   [...],
 *   }
 * `t` está en milisegundos desde el inicio del clip. Los valores no puestos en un keyframe
 * heredan el offset/rotation/scale BASE del elemento (definido al subir la imagen) + lo que
 * diga el keyframe se suma/reemplaza en el motor de reproducción (ver public/viewer/player.js).
 */

router.get('/', async (req, res) => {
  const { categoryId, state } = req.query;
  const all = await store.filter(
    'animations',
    (a) => (!categoryId || a.categoryId === categoryId) && (!state || a.state === state)
  );
  res.json(all);
});

router.post('/', adminAuth(), async (req, res) => {
  try {
    const { categoryId, state, name, duration, loop, tracks } = req.body;
    if (!categoryId || !state || !tracks) {
      return res.status(400).json({ error: 'Faltan categoryId, state o tracks.' });
    }
    assertSafeSegment(state, 'state');
    const category = await store.find('categories', (c) => c.id === categoryId);
    if (!category) return res.status(404).json({ error: 'Categoría no encontrada.' });

    for (const slot of Object.keys(tracks)) {
      if (!category.slots.includes(slot)) {
        return res.status(400).json({ error: `El slot "${slot}" no existe en esta categoría.` });
      }
      if (!Array.isArray(tracks[slot]) || tracks[slot].some((k) => typeof k.t !== 'number')) {
        return res.status(400).json({ error: `Keyframes inválidos para el slot "${slot}".` });
      }
    }

    const clip = {
      id: uuidv4(),
      categoryId,
      state, // ej: idle | walk | talk | greet ...
      name: (name || state).toString().slice(0, 80),
      duration: Number(duration) || 1000,
      loop: loop !== false,
      tracks,
      createdAt: new Date().toISOString(),
    };
    await store.insert('animations', clip);
    res.status(201).json(clip);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

router.put('/:id', adminAuth(), async (req, res) => {
  const patch = {};
  ['name', 'duration', 'loop', 'tracks', 'state'].forEach((k) => {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  });
  const updated = await store.update('animations', req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'Animación no encontrada.' });
  res.json(updated);
});

router.delete('/:id', adminAuth(), async (req, res) => {
  await store.remove('animations', req.params.id);
  res.status(204).end();
});

module.exports = router;
