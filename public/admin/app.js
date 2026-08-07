/* ---------- Utilidades ---------- */
const $ = (sel) => document.querySelector(sel);
async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
  return data;
}
function showMsg(el, text, isError = false) {
  el.textContent = text;
  el.className = 'msg' + (isError ? ' error' : '');
  if (!isError) setTimeout(() => (el.textContent = ''), 3500);
}

/* ---------- Tabs ---------- */
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel-view').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $(`#tab-${btn.dataset.tab}`).classList.add('active');
  });
});

/* =========================================================================
   CATEGORÍAS
   ========================================================================= */
let categories = [];

async function refreshCategories() {
  categories = await api('/api/categories');
  renderCatList();
  fillSelect('#elCategory', categories, true);
  fillSelect('#animCategory', categories, true);
  fillSelect('#prevCategory', categories, true);
  onElCategoryChange();
  onAnimCategoryChange();
}

function fillSelect(sel, items, useIdAsValue) {
  const el = $(sel);
  const prev = el.value;
  el.innerHTML = items.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  if (items.some((c) => c.id === prev)) el.value = prev;
}

function renderCatList() {
  $('#catList').innerHTML = categories
    .map(
      (c) => `<div class="list-item">
        <span><b>${c.name}</b> (${c.id}) — capas: ${c.slots.join(' → ')}</span>
        <button class="danger" data-del-cat="${c.id}">Eliminar</button>
      </div>`
    )
    .join('') || '<p class="hint">Aún no hay categorías.</p>';

  $('#catList').querySelectorAll('[data-del-cat]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta categoría? (no borra los archivos ya subidos)')) return;
      await api(`/api/categories/${btn.dataset.delCat}`, { method: 'DELETE' });
      refreshCategories();
    });
  });
}

$('#btnCreateCat').addEventListener('click', async () => {
  const name = $('#catName').value.trim();
  const slots = $('#catSlots').value.split(',').map((s) => s.trim()).filter(Boolean);
  try {
    await api('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slots, refWidth: +$('#catW').value, refHeight: +$('#catH').value }),
    });
    showMsg($('#catMsg'), 'Categoría creada.');
    $('#catName').value = '';
    $('#catSlots').value = '';
    refreshCategories();
  } catch (e) {
    showMsg($('#catMsg'), e.message, true);
  }
});

/* =========================================================================
   ELEMENTOS: subir + posicionar
   ========================================================================= */
function currentCategoryObj(id) {
  return categories.find((c) => c.id === id);
}

function onElCategoryChange() {
  const cat = currentCategoryObj($('#elCategory').value);
  $('#elSlot').innerHTML = cat ? cat.slots.map((s) => `<option value="${s}">${s}</option>`).join('') : '';
}
$('#elCategory').addEventListener('change', onElCategoryChange);

$('#btnUpload').addEventListener('click', async () => {
  const file = $('#elFile').files[0];
  if (!file) return showMsg($('#elMsg'), 'Elige un archivo primero.', true);
  const fd = new FormData();
  fd.append('image', file);
  fd.append('categoryId', $('#elCategory').value);
  fd.append('slot', $('#elSlot').value);
  fd.append('name', $('#elName').value);
  try {
    await api('/api/elements', { method: 'POST', body: fd });
    showMsg($('#elMsg'), 'Imagen subida. Ahora posiciónala abajo ↓');
    $('#elFile').value = '';
    $('#elName').value = '';
    loadElementsForPositioning();
  } catch (e) {
    showMsg($('#elMsg'), e.message, true);
  }
});

/* --- Editor de posición --- */
let posElements = [];
let posSelected = null;
let posDragging = false;

async function loadElementsForPositioning() {
  posElements = await api('/api/elements');
  const sel = $('#posElementSelect');
  sel.innerHTML = posElements
    .map((e) => `<option value="${e.id}">[${e.categoryId}/${e.slot}] ${e.name}</option>`)
    .join('');
  if (posElements.length) selectElementForPositioning(sel.value);
}
$('#btnReloadElements').addEventListener('click', loadElementsForPositioning);
$('#posElementSelect').addEventListener('change', (e) => selectElementForPositioning(e.target.value));

function selectElementForPositioning(id) {
  posSelected = posElements.find((e) => e.id === id) || null;
  if (!posSelected) return;
  $('#posX').value = posSelected.offsetX;
  $('#posY').value = posSelected.offsetY;
  $('#posRot').value = posSelected.rotation;
  $('#posScale').value = posSelected.scale;
  drawPosCanvas();
}

const posImgCache = {};
function getImg(src) {
  if (!posImgCache[src]) {
    const img = new Image();
    img.src = src;
    posImgCache[src] = img;
  }
  return posImgCache[src];
}

function drawPosCanvas() {
  const canvas = $('#posCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!posSelected) return;

  const cat = currentCategoryObj(posSelected.categoryId);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  // guías del lienzo de referencia
  if (cat) {
    ctx.save();
    ctx.strokeStyle = '#3a4150';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(cx - cat.refWidth / 2, cy - cat.refHeight / 2, cat.refWidth, cat.refHeight);
    ctx.restore();
  }

  // capas "fantasma" del resto de slots de la misma categoría, para dar contexto
  const siblings = posElements.filter(
    (e) => e.categoryId === posSelected.categoryId && e.slot !== posSelected.slot
  );
  const seenSlots = new Set();
  siblings.forEach((e) => {
    if (seenSlots.has(e.slot)) return;
    seenSlots.add(e.slot);
    const img = getImg(e.imagePath);
    if (img.complete && img.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.translate(cx + e.offsetX, cy + e.offsetY);
      ctx.rotate((e.rotation * Math.PI) / 180);
      ctx.scale(e.scale, e.scale);
      const w = (cat && cat.refWidth) || img.naturalWidth;
      const h = (cat && cat.refHeight) || img.naturalHeight;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  });

  // capa activa (draggable)
  const img = getImg(posSelected.imagePath);
  const draw = () => {
    ctx.save();
    ctx.translate(cx + (+$('#posX').value), cy + (+$('#posY').value));
    ctx.rotate((+$('#posRot').value * Math.PI) / 180);
    ctx.scale(+$('#posScale').value, +$('#posScale').value);
    const w = (cat && cat.refWidth) || img.naturalWidth || 100;
    const h = (cat && cat.refHeight) || img.naturalHeight || 100;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  };
  if (img.complete) draw();
  else img.onload = draw;
}

['posX', 'posY', 'posRot', 'posScale'].forEach((id) => $(`#${id}`).addEventListener('input', drawPosCanvas));

// arrastrar directamente sobre el canvas mueve offsetX/offsetY
const posCanvas = $('#posCanvas');
posCanvas.addEventListener('mousedown', () => (posDragging = true));
window.addEventListener('mouseup', () => (posDragging = false));
posCanvas.addEventListener('mousemove', (e) => {
  if (!posDragging || !posSelected) return;
  const rect = posCanvas.getBoundingClientRect();
  const scaleX = posCanvas.width / rect.width;
  const scaleY = posCanvas.height / rect.height;
  $('#posX').value = Math.round((e.clientX - rect.left) * scaleX - posCanvas.width / 2);
  $('#posY').value = Math.round((e.clientY - rect.top) * scaleY - posCanvas.height / 2);
  drawPosCanvas();
});

$('#btnSavePos').addEventListener('click', async () => {
  if (!posSelected) return;
  try {
    await api(`/api/elements/${posSelected.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offsetX: +$('#posX').value,
        offsetY: +$('#posY').value,
        rotation: +$('#posRot').value,
        scale: +$('#posScale').value,
      }),
    });
    showMsg($('#posMsg'), 'Posición guardada.');
    loadElementsForPositioning();
  } catch (e) {
    showMsg($('#posMsg'), e.message, true);
  }
});

$('#btnDeleteEl').addEventListener('click', async () => {
  if (!posSelected || !confirm('¿Eliminar este elemento y su imagen?')) return;
  await api(`/api/elements/${posSelected.id}`, { method: 'DELETE' });
  posSelected = null;
  loadElementsForPositioning();
});

/* =========================================================================
   ANIMACIONES: editor de keyframes por slot + preview en vivo
   ========================================================================= */
let animTracksState = {}; // slot -> [{t,dx,dy,drot,dscale,opacity}]
let animPlayer = null;
let animClips = [];

function onAnimCategoryChange() {
  const cat = currentCategoryObj($('#animCategory').value);
  animTracksState = {};
  (cat ? cat.slots : []).forEach((s) => (animTracksState[s] = []));
  renderTrackEditors();
  loadAnimList();
}
$('#animCategory').addEventListener('change', onAnimCategoryChange);

function renderTrackEditors() {
  const cat = currentCategoryObj($('#animCategory').value);
  const container = $('#animTracks');
  if (!cat) { container.innerHTML = ''; return; }

  container.innerHTML = cat.slots
    .map(
      (slot) => `
      <div class="track-block" data-slot="${slot}">
        <h4>Capa: ${slot}</h4>
        <div class="kf-row" style="font-size:11px;color:#8a93a3;">
          <span>t(ms)</span><span>dx</span><span>dy</span><span>drot°</span><span>dscale</span><span>opacity</span><span></span>
        </div>
        <div class="kf-list"></div>
        <button class="secondary" data-add="${slot}">+ keyframe</button>
      </div>`
    )
    .join('');

  cat.slots.forEach((slot) => renderKfRows(slot));

  container.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slot = btn.dataset.add;
      animTracksState[slot].push({ t: 0, dx: 0, dy: 0, drot: 0, dscale: 1, opacity: 1 });
      renderKfRows(slot);
    });
  });
}

function renderKfRows(slot) {
  const block = document.querySelector(`.track-block[data-slot="${slot}"] .kf-list`);
  const rows = animTracksState[slot];
  block.innerHTML = rows
    .map(
      (kf, i) => `
      <div class="kf-row">
        <input type="number" data-f="t" data-i="${i}" data-slot="${slot}" value="${kf.t}">
        <input type="number" data-f="dx" data-i="${i}" data-slot="${slot}" value="${kf.dx}">
        <input type="number" data-f="dy" data-i="${i}" data-slot="${slot}" value="${kf.dy}">
        <input type="number" data-f="drot" data-i="${i}" data-slot="${slot}" value="${kf.drot}">
        <input type="number" step="0.05" data-f="dscale" data-i="${i}" data-slot="${slot}" value="${kf.dscale}">
        <input type="number" step="0.05" min="0" max="1" data-f="opacity" data-i="${i}" data-slot="${slot}" value="${kf.opacity}">
        <button class="danger" data-rm="${i}" data-slot="${slot}">✕</button>
      </div>`
    )
    .join('');

  block.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('input', () => {
      animTracksState[inp.dataset.slot][+inp.dataset.i][inp.dataset.f] = parseFloat(inp.value) || 0;
    });
  });
  block.querySelectorAll('[data-rm]').forEach((btn) => {
    btn.addEventListener('click', () => {
      animTracksState[btn.dataset.slot].splice(+btn.dataset.rm, 1);
      renderKfRows(btn.dataset.slot);
    });
  });
}

// Arma un personaje "de muestra" (primer elemento disponible por slot) para poder
// previsualizar el clip aunque todavía no se haya guardado.
async function buildSampleCharacter(categoryId) {
  const cat = currentCategoryObj(categoryId);
  if (!cat) return null;
  const all = await api(`/api/elements?categoryId=${categoryId}`);
  const layers = [];
  cat.slots.forEach((slot) => {
    const el = all.find((e) => e.slot === slot);
    if (el) layers.push({ slot, imagePath: el.imagePath, offsetX: el.offsetX, offsetY: el.offsetY, rotation: el.rotation, scale: el.scale });
  });
  return { categoryId, refWidth: cat.refWidth, refHeight: cat.refHeight, layers, animation: null };
}

$('#btnPreviewAnim').addEventListener('click', async () => {
  const categoryId = $('#animCategory').value;
  const character = await buildSampleCharacter(categoryId);
  if (!character || character.layers.length === 0) {
    return showMsg($('#animMsg'), 'Sube al menos un elemento por capa para poder previsualizar.', true);
  }
  const clip = {
    duration: +$('#animDuration').value,
    loop: $('#animLoop').checked,
    tracks: animTracksState,
  };
  character.animation = clip;
  if (animPlayer) animPlayer.stop();
  animPlayer = new CharacterPlayer($('#animCanvas'), character);
  animPlayer.start();
});

$('#btnSaveAnim').addEventListener('click', async () => {
  try {
    await api('/api/animations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: $('#animCategory').value,
        state: $('#animState').value.trim(),
        name: $('#animName').value.trim(),
        duration: +$('#animDuration').value,
        loop: $('#animLoop').checked,
        tracks: animTracksState,
      }),
    });
    showMsg($('#animMsg'), 'Animación guardada.');
    loadAnimList();
  } catch (e) {
    showMsg($('#animMsg'), e.message, true);
  }
});

async function loadAnimList() {
  const categoryId = $('#animCategory').value;
  if (!categoryId) { $('#animList').innerHTML = ''; return; }
  animClips = await api(`/api/animations?categoryId=${categoryId}`);
  $('#animList').innerHTML = animClips
    .map(
      (a) => `<div class="list-item">
        <span><b>${a.name}</b> — estado: ${a.state} (${a.duration}ms${a.loop ? ', loop' : ''})</span>
        <span>
          <button class="secondary" data-load="${a.id}">Cargar</button>
          <button class="danger" data-del="${a.id}">✕</button>
        </span>
      </div>`
    )
    .join('') || '<p class="hint">Sin animaciones para esta categoría.</p>';

  $('#animList').querySelectorAll('[data-load]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const clip = animClips.find((a) => a.id === btn.dataset.load);
      $('#animState').value = clip.state;
      $('#animName').value = clip.name;
      $('#animDuration').value = clip.duration;
      $('#animLoop').checked = clip.loop;
      animTracksState = JSON.parse(JSON.stringify(clip.tracks));
      renderTrackEditors();
    })
  );
  $('#animList').querySelectorAll('[data-del]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await api(`/api/animations/${btn.dataset.del}`, { method: 'DELETE' });
      loadAnimList();
    })
  );
}

/* =========================================================================
   VISTA PREVIA GENERAL (probar /api/random tal cual lo vería el usuario final)
   ========================================================================= */
let prevPlayer = null;
$('#btnPrevRandom').addEventListener('click', async () => {
  const categoryId = $('#prevCategory').value;
  const state = $('#prevState').value;
  const data = await api(`/api/random?categoryId=${categoryId}&state=${state}`);
  if (prevPlayer) prevPlayer.stop();
  prevPlayer = new CharacterPlayer($('#prevCanvas'), data);
  prevPlayer.start();
});

/* ---------- init ---------- */
refreshCategories().then(loadElementsForPositioning);
