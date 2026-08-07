/**
 * Motor de reproducción tipo "marioneta": cada capa (slot) tiene una posición BASE
 * (offsetX, offsetY, rotation, scale — definida por la diseñadora al posicionar la imagen)
 * y un clip de animación opcional le suma un DELTA que varía en el tiempo mediante keyframes.
 *
 * Formato de un keyframe: { t, dx, dy, drot, dscale, opacity }
 *   t       -> milisegundos desde el inicio del clip
 *   dx, dy  -> se SUMAN al offset base
 *   drot    -> grados, se SUMA a la rotación base
 *   dscale  -> se MULTIPLICA por la escala base (1 = sin cambio)
 *   opacity -> valor absoluto 0..1 (por defecto 1)
 * Los campos que falten en un keyframe se interpolan igual, asumiendo el valor neutro
 * (dx=0, dy=0, drot=0, dscale=1, opacity=1) si tampoco aparecen en keyframes vecinos.
 */

const NEUTRAL = { dx: 0, dy: 0, drot: 0, dscale: 1, opacity: 1 };

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function sampleTrack(keyframes, timeMs) {
  if (!keyframes || keyframes.length === 0) return { ...NEUTRAL };
  const kfs = [...keyframes].sort((a, b) => a.t - b.t);

  if (timeMs <= kfs[0].t) return { ...NEUTRAL, ...kfs[0] };
  if (timeMs >= kfs[kfs.length - 1].t) return { ...NEUTRAL, ...kfs[kfs.length - 1] };

  let prev = kfs[0];
  let next = kfs[kfs.length - 1];
  for (let i = 0; i < kfs.length - 1; i++) {
    if (timeMs >= kfs[i].t && timeMs <= kfs[i + 1].t) {
      prev = kfs[i];
      next = kfs[i + 1];
      break;
    }
  }
  const span = next.t - prev.t || 1;
  const t = (timeMs - prev.t) / span;
  const p = { ...NEUTRAL, ...prev };
  const n = { ...NEUTRAL, ...next };
  return {
    dx: lerp(p.dx, n.dx, t),
    dy: lerp(p.dy, n.dy, t),
    drot: lerp(p.drot, n.drot, t),
    dscale: lerp(p.dscale, n.dscale, t),
    opacity: lerp(p.opacity, n.opacity, t),
  };
}

class CharacterPlayer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} character  -> resultado de GET /api/random (o armado a mano en el admin)
   */
  constructor(canvas, character) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.images = {}; // slot -> HTMLImageElement
    this.startedAt = performance.now();
    this.animation = null;
    this._raf = null;
    this.setCharacter(character);
  }

  setCharacter(character) {
    this.character = character;
    this.animation = character.animation || null;
    this.startedAt = performance.now();
    this.images = {};
    (character.layers || []).forEach((layer) => {
      const img = new Image();
      img.src = layer.imagePath;
      this.images[layer.slot] = img;
    });
  }

  setAnimation(clip) {
    this.animation = clip;
    this.startedAt = performance.now();
  }

  _currentTimeMs() {
    if (!this.animation) return 0;
    const elapsed = performance.now() - this.startedAt;
    if (this.animation.loop) return elapsed % this.animation.duration;
    return Math.min(elapsed, this.animation.duration);
  }

  drawFrame() {
    const { ctx, canvas, character } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!character) return;

    const t = this._currentTimeMs();
    // Punto de anclaje del personaje en el canvas: por defecto el centro, pero se puede
    // mover en vivo (ej. el visor lo actualiza cada frame con la posición WASD) sin reiniciar
    // el clip de animación.
    const anchor = character.position || { x: canvas.width / 2, y: canvas.height / 2 };
    const cx = anchor.x;
    const cy = anchor.y;

    for (const layer of character.layers) {
      const img = this.images[layer.slot];
      if (!img || !img.complete || img.naturalWidth === 0) continue;

      const track = this.animation && this.animation.tracks ? this.animation.tracks[layer.slot] : null;
      const d = sampleTrack(track, t);

      const x = cx + layer.offsetX + d.dx;
      const y = cy + layer.offsetY + d.dy;
      const rot = ((layer.rotation || 0) + d.drot) * (Math.PI / 180);
      const scale = (layer.scale || 1) * d.dscale;

      ctx.save();
      ctx.globalAlpha = d.opacity;
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(scale, scale);
      const w = character.refWidth || img.naturalWidth;
      const h = character.refHeight || img.naturalHeight;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  start() {
    const loop = () => {
      this.drawFrame();
      this._raf = requestAnimationFrame(loop);
    };
    this.stop();
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }
}

// Exponer tanto para <script type="module"> como para <script> clásico
if (typeof module !== 'undefined') module.exports = { CharacterPlayer, sampleTrack };
window.CharacterPlayer = CharacterPlayer;
