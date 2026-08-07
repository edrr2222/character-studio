const canvas = document.getElementById('stage');
const categorySelect = document.getElementById('categorySelect');
const btnNew = document.getElementById('btnNew');

let player = null; // CharacterPlayer
let pos = { x: canvas.width / 2, y: canvas.height / 2 };
let currentState = 'idle';
let currentCategory = null;

async function loadCategories() {
  const cats = await fetch('/api/categories').then((r) => r.json());
  categorySelect.innerHTML = cats.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  if (cats[0]) currentCategory = cats[0].id;
}

async function fetchRandom(state) {
  if (!currentCategory) return null;
  const res = await fetch(`/api/random?categoryId=${encodeURIComponent(currentCategory)}&state=${state}`);
  if (!res.ok) return null;
  return res.json();
}

async function newCharacter() {
  currentCategory = categorySelect.value;
  const data = await fetchRandom('idle');
  if (!data) return;
  if (player) player.stop();
  player = new CharacterPlayer(canvas, data);
  currentState = 'idle';
  player.start();
}

// Al cambiar de estado (idle <-> walk), pedimos el clip de ese estado pero conservando
// las MISMAS capas ya elegidas (no queremos que le cambien el gorro a mitad de camino).
async function setState(state) {
  if (!player || currentState === state) return;
  const data = await fetchRandom(state);
  if (!data) return;
  currentState = state;
  // conservar las capas actuales del personaje, solo cambiar la animación
  player.character.animation = data.animation;
  player.setAnimation(data.animation);
}

const keys = {};
window.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
window.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));

const SPEED = 2.6;
function movementTick() {
  if (!player) return requestAnimationFrame(movementTick);
  let moving = false;
  if (keys['w']) { pos.y -= SPEED; moving = true; }
  if (keys['s']) { pos.y += SPEED; moving = true; }
  if (keys['a']) { pos.x -= SPEED; moving = true; }
  if (keys['d']) { pos.x += SPEED; moving = true; }
  pos.x = Math.max(60, Math.min(canvas.width - 60, pos.x));
  pos.y = Math.max(60, Math.min(canvas.height - 60, pos.y));

  // mueve el punto de anclaje que usa el motor de dibujo (ver engine.js), sin tocar el DOM
  if (player) player.character.position = pos;

  setState(moving ? 'walk' : 'idle');
  requestAnimationFrame(movementTick);
}

(async function init() {
  await loadCategories();
  await newCharacter();
  movementTick();
})();

btnNew.addEventListener('click', newCharacter);
categorySelect.addEventListener('change', newCharacter);
