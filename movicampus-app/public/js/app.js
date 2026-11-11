/* MoviCampus — lógica del frontend (conecta cada pantalla con la API REST) */
(function () {
  'use strict';

  // ---------- utilidades ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
  };
  const TAG = { 'A tiempo': 'tag-success', 'Cambio': 'tag-amber', 'Alta demanda': 'tag-amber', 'Al día': 'tag-success' };

  async function api(url, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = store.get('movi_token');
    if (token) headers.Authorization = 'Bearer ' + token;
    let res;
    try {
      res = await fetch(url, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    } catch {
      throw new Error('No hay conexión con el servidor. Verifica que esté en ejecución.');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !url.startsWith('/api/auth/')) {
      store.del('movi_token');
      location.href = 'login.html';
      throw new Error(data.error || 'Sesión expirada.');
    }
    if (!res.ok) throw new Error(data.error || 'Ocurrió un error. Inténtalo de nuevo.');
    return data;
  }

  const iniciales = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('');
  const primerNombre = (n) => n.split(/\s+/)[0];
  const mostrar = (el, texto, tipo) => { if (!el) return; el.textContent = texto || ''; el.className = 'msg' + (texto ? ' msg-' + tipo : ''); };
  const horariosTxt = (h) => h.join(' · ');
  const tag = (t) => `<span class="tag ${TAG[t] || 'tag-success'}">${esc(t)}</span>`;

  // ---------- sesión y barra superior ----------
  async function iniciarSesionUI({ soloAdmin } = {}) {
    if (!store.get('movi_token')) { location.href = 'login.html'; return null; }
    const u = await api('/api/me');
    if (soloAdmin && !u.esAdmin) { location.href = 'panel.html'; return null; }
    if ($('user-name')) $('user-name').textContent = u.esAdmin && soloAdmin ? 'Coordinación' : u.nombre;
    if ($('user-avatar')) $('user-avatar').textContent = iniciales(u.nombre);
    document.querySelectorAll('[data-solo-admin]').forEach((el) => { el.hidden = !u.esAdmin; });
    const out = $('logout');
    if (out) out.addEventListener('click', (e) => { e.preventDefault(); store.del('movi_token'); location.href = 'login.html'; });
    return u;
  }

  // ---------- login ----------
  function initLogin() {
    if (store.get('movi_token')) { api('/api/me').then(() => { location.href = 'panel.html'; }).catch(() => store.del('movi_token')); }
    $('form-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('btn-login'); btn.disabled = true; mostrar($('msg'), '');
      try {
        const r = await api('/api/auth/login', { method: 'POST', body: { correo: $('correo').value, password: $('password').value } });
        store.set('movi_token', r.token);
        location.href = 'panel.html';
      } catch (err) { mostrar($('msg'), err.message, 'error'); btn.disabled = false; }
    });
  }

  // ---------- registro ----------
  function initRegistro() {
    $('form-registro').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('btn-registro'); btn.disabled = true; mostrar($('msg'), '');
      try {
        const r = await api('/api/auth/registro', {
          method: 'POST',
          body: { nombre: $('nombre').value, correo: $('correo').value, rol: $('rol').value, password: $('password').value },
        });
        store.set('movi_token', r.token);
        location.href = 'panel.html';
      } catch (err) { mostrar($('msg'), err.message, 'error'); btn.disabled = false; }
    });
  }

  // ---------- panel principal ----------
  async function initPanel() {
    const u = await iniciarSesionUI(); if (!u) return;
    $('saludo').textContent = 'Hola, ' + primerNombre(u.nombre) + ' 👋';

    $('form-buscar').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = new URLSearchParams({ origen: $('origen').value.trim(), destino: $('destino').value.trim() });
      location.href = 'buscar.html?' + q.toString();
    });

    try {
      const [notifs, favs] = await Promise.all([api('/api/notificaciones'), api('/api/favoritos')]);
      $('notificaciones').innerHTML = notifs.length ? notifs.map((n) => `
        <div class="route-item">
          <div><div class="route-name">${esc(n.ruta)}</div><div class="route-meta">${esc(n.mensaje)}</div></div>
          ${tag(n.tipo)}
        </div>`).join('') : '<p class="empty">No tienes notificaciones por ahora.</p>';

      $('favoritas').innerHTML = favs.map((r) => `
        <div class="card">
          <div class="route-name">${esc(r.nombre)} <span class="favorite-star" aria-label="Favorita">★</span></div>
          <div class="route-meta">${esc(horariosTxt(r.horarios))}</div>
        </div>`).join('') + `
        <div class="card" style="display:flex; align-items:center; justify-content:center;">
          <a href="buscar.html" class="btn btn-secondary">+ Agregar ruta favorita</a>
        </div>`;
    } catch (err) { mostrar($('msg'), err.message, 'error'); }
  }

  // ---------- buscar rutas ----------
  async function initBuscar() {
    const u = await iniciarSesionUI(); if (!u) return;
    const params = new URLSearchParams(location.search);
    const origen = params.get('origen') || '';
    const destino = params.get('destino') || '';
    const lista = $('resultados');

    try {
      const r = await api('/api/rutas?' + new URLSearchParams({ origen, destino }).toString());
      $('lead').textContent = r.total === 0
        ? 'No encontramos rutas para tu búsqueda.'
        : `${r.total} ${r.total === 1 ? 'alternativa disponible' : 'alternativas disponibles'} según tu origen y destino.`;
      if (r.total === 0) {
        lista.innerHTML = `<p class="empty">Prueba con otro barrio o <a href="buscar.html">consulta todas las rutas</a>.</p>`;
        return;
      }
      lista.innerHTML = r.rutas.map((x) => `
        <div class="route-item" data-id="${x.id}">
          <div>
            <div class="route-name">${esc(x.nombre)}</div>
            <div class="route-meta">Salidas: ${esc(horariosTxt(x.horarios))}${x.duracionMin ? ` — Duración aprox. ${x.duracionMin} min` : ''}</div>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            ${tag(x.etiqueta)}
            <button type="button" class="btn btn-secondary btn-fav" data-fav="${x.favorita ? 1 : 0}" aria-pressed="${x.favorita}">${x.favorita ? '★ Guardada' : '★ Guardar'}</button>
          </div>
        </div>`).join('');

      lista.addEventListener('click', async (e) => {
        const b = e.target.closest('.btn-fav'); if (!b) return;
        const id = b.closest('.route-item').dataset.id;
        const era = b.dataset.fav === '1';
        b.disabled = true;
        try {
          await api('/api/favoritos/' + id, { method: era ? 'DELETE' : 'POST' });
          b.dataset.fav = era ? '0' : '1';
          b.textContent = era ? '★ Guardar' : '★ Guardada';
          b.setAttribute('aria-pressed', String(!era));
          mostrar($('msg'), era ? 'Ruta quitada de tus favoritas.' : 'Ruta guardada en tus favoritas.', 'ok');
        } catch (err) { mostrar($('msg'), err.message, 'error'); }
        b.disabled = false;
      });
    } catch (err) { mostrar($('msg'), err.message, 'error'); }
  }

  // ---------- perfil y favoritas ----------
  async function initPerfil() {
    const u = await iniciarSesionUI(); if (!u) return;
    $('nombre').value = u.nombre; $('correo').value = u.correo; $('rol').value = u.rol;

    $('form-perfil').addEventListener('submit', async (e) => {
      e.preventDefault(); mostrar($('msg'), '');
      try {
        const n = await api('/api/me', { method: 'PUT', body: { nombre: $('nombre').value } });
        $('user-name').textContent = n.nombre; $('user-avatar').textContent = iniciales(n.nombre);
        mostrar($('msg'), 'Cambios guardados.', 'ok');
      } catch (err) { mostrar($('msg'), err.message, 'error'); }
    });

    const pintar = async () => {
      const favs = await api('/api/favoritos');
      $('favoritas').innerHTML = favs.length ? favs.map((r) => `
        <div class="route-item" data-id="${r.id}">
          <div>
            <div class="route-name">${esc(r.nombre)}
              <button type="button" class="favorite-star btn-quitar" aria-label="Quitar ${esc(r.nombre)} de favoritas" title="Quitar de favoritas">★</button></div>
            <div class="route-meta">${esc(horariosTxt(r.horarios))}</div>
          </div>
        </div>`).join('') : '<p class="empty">Aún no tienes rutas favoritas.</p>';
    };
    $('favoritas').addEventListener('click', async (e) => {
      const b = e.target.closest('.btn-quitar'); if (!b) return;
      try { await api('/api/favoritos/' + b.closest('.route-item').dataset.id, { method: 'DELETE' }); await pintar(); }
      catch (err) { mostrar($('msg'), err.message, 'error'); }
    });
    try { await pintar(); } catch (err) { mostrar($('msg'), err.message, 'error'); }
  }

  // ---------- admin: gestión de rutas ----------
  async function initAdminRutas() {
    const u = await iniciarSesionUI({ soloAdmin: true }); if (!u) return;
    let editando = null; let rutas = [];

    const pintar = async () => {
      rutas = await api('/api/admin/rutas');
      $('tabla-rutas').innerHTML = rutas.map((r) => `
        <tr data-id="${r.id}">
          <td>${esc(r.nombre)}</td>
          <td>${esc(r.horarios.join(', '))}</td>
          <td><span class="tag ${r.estado === 'Activa' ? 'tag-success' : 'tag-amber'}">${esc(r.estado)}</span></td>
          <td><div class="actions">
            <button type="button" class="btn btn-ghost btn-editar">Editar</button>
            <button type="button" class="btn btn-ghost btn-eliminar" aria-label="Eliminar ${esc(r.nombre)}">Eliminar</button>
          </div></td>
        </tr>`).join('') || '<tr><td colspan="4" class="empty">No hay rutas registradas.</td></tr>';
    };
    const limpiar = () => {
      editando = null; $('form-ruta').reset();
      $('titulo-form').textContent = 'Nueva ruta'; $('btn-guardar').textContent = 'Guardar ruta'; $('btn-cancelar').hidden = true;
    };

    $('form-ruta').addEventListener('submit', async (e) => {
      e.preventDefault(); mostrar($('msg'), '');
      const body = { nombre: $('nombre').value, horarios: $('horarios').value, estado: $('estado').value };
      try {
        if (editando) await api('/api/admin/rutas/' + editando, { method: 'PUT', body });
        else await api('/api/admin/rutas', { method: 'POST', body });
        mostrar($('msg'), editando ? 'Ruta actualizada. Si cambiaste los horarios, los usuarios verán el aviso de cambio.' : 'Ruta registrada.', 'ok');
        limpiar(); await pintar();
      } catch (err) { mostrar($('msg'), err.message, 'error'); }
    });
    $('btn-cancelar').addEventListener('click', limpiar);

    $('tabla-rutas').addEventListener('click', async (e) => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      const r = rutas.find((x) => x.id === Number(tr.dataset.id));
      if (e.target.closest('.btn-editar')) {
        editando = r.id;
        $('nombre').value = r.nombre; $('horarios').value = r.horarios.join(', '); $('estado').value = r.estado;
        $('titulo-form').textContent = 'Editar ruta'; $('btn-guardar').textContent = 'Actualizar ruta'; $('btn-cancelar').hidden = false;
        $('nombre').focus();
      } else if (e.target.closest('.btn-eliminar')) {
        if (!confirm(`¿Eliminar "${r.nombre}"? También se quitará de las favoritas de los usuarios.`)) return;
        try { await api('/api/admin/rutas/' + r.id, { method: 'DELETE' }); mostrar($('msg'), 'Ruta eliminada.', 'ok'); await pintar(); }
        catch (err) { mostrar($('msg'), err.message, 'error'); }
      }
    });
    try { await pintar(); } catch (err) { mostrar($('msg'), err.message, 'error'); }
  }

  // ---------- admin: reportes ----------
  async function initAdminReportes() {
    const u = await iniciarSesionUI({ soloAdmin: true }); if (!u) return;
    try {
      const r = await api('/api/admin/reportes');
      $('stat-activos').textContent = r.usuariosActivos.toLocaleString('es-CO');
      $('stat-busquedas').textContent = r.busquedas.toLocaleString('es-CO');
      $('stat-fav').textContent = r.pctConFavorita + '%';
      $('ranking').innerHTML = r.ranking.length ? r.ranking.map((x) => `
        <div style="margin-bottom:14px;">
          <div class="route-meta">${esc(x.nombre)} — ${x.consultas} ${x.consultas === 1 ? 'consulta' : 'consultas'}</div>
          <div class="bar" role="img" aria-label="${esc(x.nombre)}: ${x.pct}% respecto a la ruta más consultada"><div class="bar-fill" style="width:${x.pct}%;"></div></div>
        </div>`).join('') : '<p class="empty">Aún no hay consultas registradas.</p>';
    } catch (err) { mostrar($('msg'), err.message, 'error'); }
  }

  // ---------- arranque ----------
  const paginas = { login: initLogin, registro: initRegistro, panel: initPanel, buscar: initBuscar, perfil: initPerfil, 'admin-rutas': initAdminRutas, 'admin-reportes': initAdminReportes };
  document.addEventListener('DOMContentLoaded', () => {
    const f = paginas[document.body.dataset.page];
    if (f) f();
  });
})();
