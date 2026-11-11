// Capa de datos de MoviCampus: SQLite (archivo local data/movicampus.db)
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite'); // SQLite integrado en Node.js 22.13+ (sin dependencias nativas)
const bcrypt = require('bcryptjs');

const dir = path.join(__dirname, 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(process.env.DB_FILE || path.join(dir, 'movicampus.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// Transacción sencilla: confirma si todo sale bien y revierte si hay error.
db.tx = (fn) => {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
};

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  correo        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  rol           TEXT NOT NULL CHECK (rol IN ('Estudiante','Docente','Personal administrativo')),
  es_admin      INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT NOT NULL,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acceso TEXT
);

CREATE TABLE IF NOT EXISTS rutas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  barrios      TEXT NOT NULL DEFAULT '',
  horarios     TEXT NOT NULL,
  duracion_min INTEGER,
  estado       TEXT NOT NULL DEFAULT 'Activa' CHECK (estado IN ('Activa','En revisión')),
  etiqueta     TEXT NOT NULL DEFAULT 'A tiempo' CHECK (etiqueta IN ('A tiempo','Cambio','Alta demanda')),
  aviso        TEXT,
  cambio_en    TEXT,
  creado_en    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS favoritos (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ruta_id    INTEGER NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
  creado_en  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usuario_id, ruta_id)
);

CREATE TABLE IF NOT EXISTS busquedas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  origen     TEXT,
  destino    TEXT,
  resultados INTEGER NOT NULL DEFAULT 0,
  fecha      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS consultas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ruta_id    INTEGER NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha      TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---- Datos semilla (solo si la base está vacía) ----
function sembrar() {
  const hay = db.prepare('SELECT COUNT(*) n FROM usuarios').get().n;
  if (hay > 0) return;

  const insU = db.prepare(
    'INSERT INTO usuarios (nombre, correo, rol, es_admin, password_hash) VALUES (?,?,?,?,?)'
  );
  insU.run('Coordinación Académica', 'coordinacion@ibero.edu.co', 'Personal administrativo', 1,
    bcrypt.hashSync('Admin2026!', 10));
  const camila = insU.run('Camila Torres', 'camila.torres@ibero.edu.co', 'Estudiante', 0,
    bcrypt.hashSync('Movi2026!', 10)).lastInsertRowid;

  const insR = db.prepare(
    `INSERT INTO rutas (nombre, barrios, horarios, duracion_min, estado, etiqueta, aviso)
     VALUES (?,?,?,?,?,?,?)`
  );
  const r4 = insR.run('Ruta 4 — Suba Express', 'Suba, Niza, Prado, Mazurén',
    '6:50 a.m., 7:30 a.m., 12:15 p.m.', 35, 'Activa', 'Cambio',
    'Cambio de horario: ahora sale 6:50 a.m.').lastInsertRowid;
  const r7 = insR.run('Ruta 7 — Kennedy', 'Kennedy, Bosa, Techo, Patio Bonito',
    '6:15 a.m., 6:45 a.m., 1:00 p.m.', 42, 'Activa', 'A tiempo', null).lastInsertRowid;
  insR.run('Ruta 2 — Chapinero', 'Chapinero, Chicó, Usaquén, Rosales',
    '7:00 a.m., 7:40 a.m.', 25, 'Activa', 'Alta demanda', 'Servicio normal esta semana');

  const insF = db.prepare('INSERT INTO favoritos (usuario_id, ruta_id) VALUES (?,?)');
  insF.run(camila, r4);
  insF.run(camila, r7);
}
sembrar();

module.exports = db;
