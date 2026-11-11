# MoviCampus — MVP funcional

Sistema web de movilidad universitaria (Corporación Universitaria Iberoamericana).
Este repositorio contiene el prototipo de alta fidelidad (HTML + CSS) **conectado a un backend real**:

- **Frontend:** HTML5, CSS (`public/styles.css`) y JavaScript puro (`public/js/app.js`, usa `fetch`).
- **Backend:** Node.js + Express (API REST en JSON).
- **Base de datos:** SQLite integrado en Node.js (`node:sqlite`; archivo `data/movicampus.db`, se crea solo al iniciar). No requiere instalar ni compilar nada adicional.
- **Seguridad básica:** contraseñas con bcrypt, sesión con JWT (8 h), consultas SQL parametrizadas, control de acceso por rol.

## Requisitos
- Node.js **22.13 o superior** (versión LTS actual; incluye SQLite). Verifica con `node -v`.

## Cómo ejecutarlo
```bash
npm install
npm start
# abrir http://localhost:3000
```
Variables opcionales: `PORT`, `JWT_SECRET` (defínela si vas a publicarlo) y `DOMINIO_PERMITIDO` (por ejemplo `ibero.edu.co` para exigir correo institucional al registrarse).

## Cuentas de demostración (se crean con la primera ejecución)
| Perfil | Correo | Contraseña |
|---|---|---|
| Estudiante | camila.torres@ibero.edu.co | Movi2026! |
| Coordinación (admin) | coordinacion@ibero.edu.co | Admin2026! |

Elegir el rol "Personal administrativo" al registrarse **no** concede permisos de administrador; ese permiso solo se asigna directamente en la base de datos.
Para reiniciar los datos de demostración, detén el servidor y borra `data/movicampus.db`.

## Funcionalidad principal operativa
Registro e inicio de sesión → búsqueda de rutas por barrio/origen → guardar rutas favoritas (persisten en la base de datos) → avisos de cambio de horario generados cuando la coordinación edita los horarios de una ruta → reportes de uso.

## API
| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/auth/registro` | Público | Crea cuenta y devuelve token |
| POST | `/api/auth/login` | Público | Inicia sesión y devuelve token |
| GET / PUT | `/api/me` | Usuario | Consulta o edita el perfil (nombre) |
| GET | `/api/rutas?origen=&destino=` | Usuario | Busca rutas activas (registra la búsqueda) |
| GET | `/api/notificaciones` | Usuario | Avisos de cambio de horario |
| GET | `/api/favoritos` | Usuario | Lista las rutas favoritas |
| POST / DELETE | `/api/favoritos/:rutaId` | Usuario | Guarda o quita una favorita |
| GET / POST | `/api/admin/rutas` | Admin | Lista o crea rutas |
| PUT / DELETE | `/api/admin/rutas/:id` | Admin | Edita o elimina una ruta |
| GET | `/api/admin/reportes` | Admin | Indicadores de uso |

## Estructura
```
movicampus/
├── server.js          # API REST + servidor de archivos estáticos
├── db.js              # esquema SQLite y datos semilla
├── package.json
├── data/              # base de datos (no se sube a Git)
└── public/            # frontend
    ├── login.html · registro.html · panel.html · buscar.html
    ├── perfil.html · admin-rutas.html · admin-reportes.html
    ├── styles.css
    └── js/app.js
```

## Publicación
GitHub Pages solo sirve archivos estáticos, por lo que **no puede ejecutar el backend**. Para publicar el MVP completo usa un servicio con Node.js (por ejemplo Render o Railway) y define `JWT_SECRET`. Para una demostración local basta con `npm start`.
