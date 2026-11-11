// MoviCampus — servidor del MVP
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'movicampus-secreto-de-desarrollo';
const DOMINIO_PERMITIDO = (process.env.DOMINIO_PERMITIDO || '').toLowerCase();

if (!process.env.JWT_SECRET) {
  console.warn('[aviso] JWT_SECRET no está definido; se usa un secreto de desarrollo.');
}

const ROLES = ['Estudiante', 'Docente', 'Personal administrativo'];
const ESTADOS = ['Activa', 'En revisión'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIAS_CAMBIO = 7;

const app = express();

app.use(express.json({ limit: '50kb' }));
app.get('/', (req, res) => res.redirect('/login.html'));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- utilidades ----------

const sinTildes = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const lista = (h) =>
  String(h || '').split(',').map((x) => x.trim()).filter(Boolean);

const limpiar = (v, max) =>
  String(v ?? '').trim().slice(0, max);

// Coincidencia exacta de un barrio.
function coincideBarrio(barrios, busqueda) {
  const buscado = sinTildes(busqueda);

  return lista(barrios).some(
    (barrio) => sinTildes(barrio) === buscado
  );
}

function publicUser(u) {
  return {
    id: u.id,
    nombre: u.nombre,
    correo: u.correo,
    rol: u.rol,
    esAdmin: !!u.es_admin
  };
}

// Una etiqueta "Cambio" caduca a los 7 días.
function rutaDTO(r, favSet) {
  let etiqueta = r.etiqueta;
  let aviso = r.aviso;

  if (r.cambio_en && etiqueta === 'Cambio') {
    const dias = (
      Date.now() -
      new Date(r.cambio_en.replace(' ', 'T') + 'Z').getTime()
    ) / 86400000;

    if (dias > DIAS_CAMBIO) {
      etiqueta = 'A tiempo';
      aviso = null;
    }
  }

  return {
    id: r.id,
    nombre: r.nombre,
    barrios: r.barrios,
    horarios: lista(r.horarios),
    duracionMin: r.duracion_min,
    estado: r.estado,
    etiqueta,
    aviso,
    favorita: favSet ? favSet.has(r.id) : undefined
  };
}

const favoritosDe = (uid) =>
  new Set(
    db.prepare('SELECT ruta_id FROM favoritos WHERE usuario_id=?')
      .all(uid)
      .map((x) => x.ruta_id)
  );

const firmar = (u) =>
  jwt.sign({ sub: u.id }, JWT_SECRET, { expiresIn: '8h' });

// ---------- middleware ----------

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Debes iniciar sesión.' });
  }

  try {
    const { sub } = jwt.verify(token, JWT_SECRET);
    const u = db.prepare('SELECT * FROM usuarios WHERE id=?').get(sub);

    if (!u) {
      return res.status(401).json({ error: 'Sesión no válida.' });
    }

    req.user = u;
    next();
  } catch {
    res.status(401).json({
      error: 'Tu sesión expiró. Inicia sesión de nuevo.'
    });
  }
}

function soloAdmin(req, res, next) {
  if (!req.user.es_admin) {
    return res.status(403).json({
      error: 'Esta sección es solo para coordinación académica.'
    });
  }

  next();
}

// ---------- autenticación ----------

app.post('/api/auth/registro', (req, res) => {
  const nombre = limpiar(req.body.nombre, 80);
  const correo = limpiar(req.body.correo, 120).toLowerCase();
  const rol = limpiar(req.body.rol, 40);
  const password = String(req.body.password ?? '');

  if (nombre.length < 2) {
    return res.status(400).json({ error: 'Escribe tu nombre completo.' });
  }

  if (!EMAIL_RE.test(correo)) {
    return res.status(400).json({ error: 'Escribe un correo válido.' });
  }

  if (DOMINIO_PERMITIDO && !correo.endsWith('@' + DOMINIO_PERMITIDO)) {
    return res.status(400).json({
      error: 'Usa tu correo institucional (@' + DOMINIO_PERMITIDO + ').'
    });
  }

  if (!ROLES.includes(rol)) {
    return res.status(400).json({ error: 'Selecciona un rol válido.' });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: 'La contraseña debe tener al menos 8 caracteres.'
    });
  }

  if (db.prepare('SELECT 1 FROM usuarios WHERE correo=?').get(correo)) {
    return res.status(409).json({
      error: 'Ya existe una cuenta con ese correo.'
    });
  }

  const info = db.prepare(
    "INSERT INTO usuarios (nombre, correo, rol, password_hash, ultimo_acceso) VALUES (?,?,?,?,datetime('now'))"
  ).run(nombre, correo, rol, bcrypt.hashSync(password, 10));

  const u = db.prepare('SELECT * FROM usuarios WHERE id=?')
    .get(info.lastInsertRowid);

  res.status(201).json({
    token: firmar(u),
    usuario: publicUser(u)
  });
});

app.post('/api/auth/login', (req, res) => {
  const correo = limpiar(req.body.correo, 120).toLowerCase();
  const password = String(req.body.password ?? '');

  const u = db.prepare('SELECT * FROM usuarios WHERE correo=?').get(correo);

  if (!u || !bcrypt.compareSync(password, u.password_hash)) {
    return res.status(401).json({
      error: 'Correo o contraseña incorrectos.'
    });
  }

  db.prepare(
    "UPDATE usuarios SET ultimo_acceso=datetime('now') WHERE id=?"
  ).run(u.id);

  res.json({
    token: firmar(u),
    usuario: publicUser(u)
  });
});

app.get('/api/me', auth, (req, res) => {
  res.json(publicUser(req.user));
});

app.put('/api/me', auth, (req, res) => {
  const nombre = limpiar(req.body.nombre, 80);

  if (nombre.length < 2) {
    return res.status(400).json({
      error: 'Escribe tu nombre completo.'
    });
  }

  db.prepare('UPDATE usuarios SET nombre=? WHERE id=?')
    .run(nombre, req.user.id);

  res.json(publicUser({ ...req.user, nombre }));
});

// ---------- rutas (consulta) ----------

app.get('/api/rutas', auth, (req, res) => {
  const origen = limpiar(req.query.origen, 80);
  const destino = limpiar(req.query.destino, 120);

  console.log('Búsqueda recibida:', { origen, destino });

  const fav = favoritosDe(req.user.id);

  let rutas = db.prepare(
    "SELECT * FROM rutas WHERE estado='Activa' ORDER BY id"
  ).all();

  // Filtrar por coincidencia exacta del origen.
  if (origen) {
    rutas = rutas.filter((r) =>
      coincideBarrio(r.barrios, origen)
    );
  }

  // Filtrar por coincidencia exacta del destino.
  if (destino) {
    rutas = rutas.filter((r) =>
      coincideBarrio(r.barrios, destino)
    );
  }

  const dtos = rutas.map((r) => rutaDTO(r, fav));

  // Guardar el historial de búsqueda.
  db.prepare(
    'INSERT INTO busquedas (usuario_id, origen, destino, resultados) VALUES (?,?,?,?)'
  ).run(req.user.id, origen, destino, dtos.length);

  // Registrar las rutas consultadas.
  const insC = db.prepare(
    'INSERT INTO consultas (ruta_id, usuario_id) VALUES (?,?)'
  );

  db.tx(() => {
    dtos.forEach((r) => insC.run(r.id, req.user.id));
  });

  res.json({
    total: dtos.length,
    rutas: dtos
  });
});

// ---------- favoritos ----------

app.get('/api/favoritos', auth, (req, res) => {
  const rows = db.prepare(
    `SELECT r.* FROM favoritos f JOIN rutas r ON r.id=f.ruta_id
     WHERE f.usuario_id=? ORDER BY f.creado_en, r.id`
  ).all(req.user.id);

  res.json(
    rows.map((r) => rutaDTO(r, new Set(rows.map((x) => x.id))))
  );
});

app.post('/api/favoritos/:rutaId', auth, (req, res) => {
  const id = Number(req.params.rutaId);

  if (!db.prepare('SELECT 1 FROM rutas WHERE id=?').get(id)) {
    return res.status(404).json({ error: 'La ruta no existe.' });
  }

  db.prepare(
    'INSERT OR IGNORE INTO favoritos (usuario_id, ruta_id) VALUES (?,?)'
  ).run(req.user.id, id);

  res.status(201).json({ ok: true });
});

app.delete('/api/favoritos/:rutaId', auth, (req, res) => {
  db.prepare(
    'DELETE FROM favoritos WHERE usuario_id=? AND ruta_id=?'
  ).run(req.user.id, Number(req.params.rutaId));

  res.json({ ok: true });
});

// ---------- administración de rutas ----------

function leerRuta(body) {
  const nombre = limpiar(body.nombre, 80);
  const horarios = lista(limpiar(body.horarios, 300));
  const estado = limpiar(body.estado, 20) || 'Activa';

  if (nombre.length < 3) {
    return { error: 'Escribe el nombre de la ruta.' };
  }

  if (!horarios.length) {
    return { error: 'Escribe al menos un horario.' };
  }

  if (!ESTADOS.includes(estado)) {
    return { error: 'Estado no válido.' };
  }

  return {
    nombre,
    horarios: horarios.join(', '),
    estado
  };
}

app.get('/api/admin/rutas', auth, soloAdmin, (req, res) => {
  res.json(
    db.prepare('SELECT * FROM rutas ORDER BY id')
      .all()
      .map((r) => rutaDTO(r))
  );
});

app.post('/api/admin/rutas', auth, soloAdmin, (req, res) => {
  const d = leerRuta(req.body);

  if (d.error) {
    return res.status(400).json({ error: d.error });
  }

  if (db.prepare('SELECT 1 FROM rutas WHERE nombre=?').get(d.nombre)) {
    return res.status(409).json({
      error: 'Ya existe una ruta con ese nombre.'
    });
  }

  const info = db.prepare(
    'INSERT INTO rutas (nombre, horarios, estado) VALUES (?,?,?)'
  ).run(d.nombre, d.horarios, d.estado);

  res.status(201).json(
    rutaDTO(
      db.prepare('SELECT * FROM rutas WHERE id=?')
        .get(info.lastInsertRowid)
    )
  );
});

app.put('/api/admin/rutas/:id', auth, soloAdmin, (req, res) => {
  const id = Number(req.params.id);

  const actual = db.prepare(
    'SELECT * FROM rutas WHERE id=?'
  ).get(id);

  if (!actual) {
    return res.status(404).json({ error: 'La ruta no existe.' });
  }

  const d = leerRuta(req.body);

  if (d.error) {
    return res.status(400).json({ error: d.error });
  }

  const dup = db.prepare(
    'SELECT id FROM rutas WHERE nombre=? AND id<>?'
  ).get(d.nombre, id);

  if (dup) {
    return res.status(409).json({
      error: 'Ya existe una ruta con ese nombre.'
    });
  }

  const cambioHorario =
    lista(actual.horarios).join(', ') !== d.horarios;

  if (cambioHorario) {
    db.prepare(
      `UPDATE rutas SET nombre=?, horarios=?, estado=?, etiqueta='Cambio',
       aviso=?, cambio_en=datetime('now') WHERE id=?`
    ).run(
      d.nombre,
      d.horarios,
      d.estado,
      'Cambio de horario: ahora sale ' + lista(d.horarios)[0],
      id
    );
  } else {
    db.prepare(
      'UPDATE rutas SET nombre=?, horarios=?, estado=? WHERE id=?'
    ).run(d.nombre, d.horarios, d.estado, id);
  }

  res.json(
    rutaDTO(
      db.prepare('SELECT * FROM rutas WHERE id=?').get(id)
    )
  );
});

app.delete('/api/admin/rutas/:id', auth, soloAdmin, (req, res) => {
  const info = db.prepare(
    'DELETE FROM rutas WHERE id=?'
  ).run(Number(req.params.id));

  if (!info.changes) {
    return res.status(404).json({ error: 'La ruta no existe.' });
  }

  res.json({ ok: true });
});

// ---------- reportes de administración ----------

app.get('/api/admin/reportes', auth, soloAdmin, (req, res) => {
  const usuarios = db.prepare(
    'SELECT COUNT(*) n FROM usuarios WHERE es_admin=0'
  ).get().n;

  const activos = db.prepare(
    "SELECT COUNT(*) n FROM usuarios WHERE es_admin=0 AND ultimo_acceso >= datetime('now','-30 days')"
  ).get().n;

  const busquedas = db.prepare(
    'SELECT COUNT(*) n FROM busquedas'
  ).get().n;

  const conFav = db.prepare(
    `SELECT COUNT(DISTINCT f.usuario_id) n
     FROM favoritos f JOIN usuarios u ON u.id=f.usuario_id
     WHERE u.es_admin=0`
  ).get().n;

  const ranking = db.prepare(
    `SELECT r.nombre, COUNT(c.id) consultas
     FROM rutas r LEFT JOIN consultas c ON c.ruta_id=r.id
     GROUP BY r.id ORDER BY consultas DESC, r.id LIMIT 5`
  ).all();

  const max = Math.max(1, ...ranking.map((x) => x.consultas));

  res.json({
    usuariosActivos: activos,
    busquedas,
    pctConFavorita: usuarios
      ? Math.round((100 * conFav) / usuarios)
      : 0,
    ranking: ranking.map((x) => ({
      ...x,
      pct: Math.round((100 * x.consultas) / max)
    }))
  });
});

// ---------- estado del servidor ----------

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// API: 404 en JSON.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado.' });
});

// Manejo de errores.
app.use((err, req, res, next) => {
  if (err.type !== 'entity.parse.failed') {
    console.error(err);
  }

  res.status(
    err.type === 'entity.parse.failed' ? 400 : 500
  ).json({
    error: err.type === 'entity.parse.failed'
      ? 'Solicitud mal formada.'
      : 'Error interno del servidor.'
  });
});

// ---------- inicio del servidor ----------

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('MoviCampus en http://localhost:' + PORT);
  });
}

module.exports = app;
