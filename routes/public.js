const express = require('express');
const store = require('../lib/store');

const router = express.Router();

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// GET /api/random?categoryId=personas&state=idle
// Devuelve un personaje armado al azar: una imagen elegida por slot + el clip de animación
// pedido (o "idle" por defecto) para que el visor lo reproduzca.
router.get('/random', async (req, res) => {
  const categoryId = req.query.categoryId;
  const state = req.query.state || 'idle';
  if (!categoryId) return res.status(400).json({ error: 'Falta categoryId.' });

  const category = await store.find('categories', (c) => c.id === categoryId);
  if (!category) return res.status(404).json({ error: 'Categoría no encontrada.' });

  const layers = [];
  for (const slot of category.slots) {
    const options = await store.filter('elements', (e) => e.categoryId === categoryId && e.slot === slot);
    if (options.length === 0) continue; // slot sin assets todavía -> se omite, no rompe el montaje
    const chosen = pick(options);
    layers.push({
      slot,
      elementId: chosen.id,
      imagePath: chosen.imagePath,
      offsetX: chosen.offsetX,
      offsetY: chosen.offsetY,
      rotation: chosen.rotation,
      scale: chosen.scale,
    });
  }

  const clips = await store.filter('animations', (a) => a.categoryId === categoryId && a.state === state);
  const animation = clips.length ? pick(clips) : null;

  res.json({
    categoryId,
    refWidth: category.refWidth,
    refHeight: category.refHeight,
    layers,
    animation, // puede ser null si aún no hay animación para ese estado -> el visor queda estático
  });
});

module.exports = router;
