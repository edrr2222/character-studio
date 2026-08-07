/**
 * Store JSON plano, sin motor de base de datos.
 * - Cada "tabla" es un archivo .json dentro de /data
 * - Escritura atómica: escribe a un .tmp y luego renombra (evita archivos truncados si el proceso muere)
 * - Cola de escritura por archivo: evita que dos requests concurrentes se pisen y corrompan el JSON
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const queues = {}; // { fileName: Promise en curso }

function filePath(name) {
  // whitelist estricta: solo nombres de tabla conocidos, nunca construido desde input de usuario
  if (!/^[a-z_]+$/.test(name)) throw new Error('Nombre de tabla inválido');
  return path.join(DATA_DIR, `${name}.json`);
}

function readSync(name) {
  const p = filePath(name);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf-8').trim();
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`⚠️  ${name}.json corrupto, se ignora y se trata como vacío:`, e.message);
    return [];
  }
}

function writeAtomicSync(name, data) {
  const p = filePath(name);
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, p);
}

// Encola una operación de lectura-modificación-escritura para que no se solapen sobre la misma tabla
function withTable(name, mutator) {
  const prev = queues[name] || Promise.resolve();
  const next = prev
    .catch(() => {}) // no dejar que un error previo bloquee la cola
    .then(() => {
      const data = readSync(name);
      const result = mutator(data);
      // mutator puede devolver el nuevo array completo, o mutar `data` in-place y no devolver nada
      const toWrite = Array.isArray(result) ? result : data;
      writeAtomicSync(name, toWrite);
      return result;
    });
  queues[name] = next;
  return next;
}

module.exports = {
  list(name) {
    return Promise.resolve(readSync(name));
  },
  find(name, predicate) {
    return Promise.resolve(readSync(name).find(predicate) || null);
  },
  filter(name, predicate) {
    return Promise.resolve(readSync(name).filter(predicate));
  },
  insert(name, record) {
    return withTable(name, (data) => {
      data.push(record);
      return data;
    }).then(() => record);
  },
  update(name, id, patch) {
    return withTable(name, (data) => {
      const idx = data.findIndex((r) => r.id === id);
      if (idx === -1) return data;
      data[idx] = { ...data[idx], ...patch };
      return data;
    }).then(() => readSync(name).find((r) => r.id === id) || null);
  },
  remove(name, id) {
    return withTable(name, (data) => data.filter((r) => r.id !== id));
  },
  ensureFile(name) {
    const p = filePath(name);
    if (!fs.existsSync(p)) writeAtomicSync(name, []);
  },
};
