# Dashboard de Control de Asistencia y EPP

Aplicación web SPA para el control de asistencia y cumplimiento de Equipo de Protección Personal (EPP) en campo. Construida con **HTML5**, **Tailwind CSS** (vía CDN), **JavaScript ES6+ (módulos)**, **Chart.js** y **Firebase Firestore**, lista para desplegarse gratis en GitHub Pages o Vercel.

> **Nota:** si abres `index.html` sin configurar Firebase, la aplicación detecta automáticamente que no hay conexión y carga **datos de demostración** para que puedas explorar todas las vistas sin configuración previa. Verás un aviso amarillo en el menú lateral indicando "Modo demostración".

---

## 📁 Estructura del proyecto

```
.
├── index.html              # Interfaz principal (SPA con 5 pestañas)
├── src/
│   ├── app.js               # Lógica principal, navegación y gráficos
│   ├── firebase-config.js   # Inicialización de Firebase + funciones CRUD
│   └── calculations.js      # Motor de cálculos de KPIs y métricas
├── firestore.rules          # Reglas de seguridad de Firestore
└── README.md
```

---

## 1. Configuración de Firebase

### 1.1 Crear el proyecto en Firebase Console

1. Ve a [https://console.firebase.google.com](https://console.firebase.google.com) e inicia sesión con tu cuenta de Google.
2. Haz clic en **"Agregar proyecto"** (o "Add project").
3. Asigna un nombre, por ejemplo `control-asistencia-epp`, y continúa con los pasos (puedes desactivar Google Analytics si no lo necesitas).
4. Cuando el proyecto termine de crearse, haz clic en **"Continuar"**.

### 1.2 Registrar una app web

1. En el panel principal del proyecto, haz clic en el ícono **`</>`** ("Web") para agregar una app web.
2. Asigna un apodo, por ejemplo `dashboard-asistencia`, y **no** marques la opción de Firebase Hosting (usaremos GitHub Pages).
3. Firebase te mostrará un objeto `firebaseConfig` similar a este:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "control-asistencia-epp.firebaseapp.com",
  projectId: "control-asistencia-epp",
  storageBucket: "control-asistencia-epp.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};
```

4. Copia esos valores y pégalos en el archivo **`src/firebase-config.js`**, reemplazando los valores de ejemplo (`TU_API_KEY_AQUI`, etc.).

### 1.3 Habilitar Firestore Database

1. En el menú lateral de Firebase Console, ve a **Compilación → Firestore Database**.
2. Haz clic en **"Crear base de datos"**.
3. Selecciona **"Iniciar en modo de prueba"** (esto permite lectura/escritura temporal; luego aplicarás las reglas del archivo `firestore.rules`).
4. Elige la ubicación del servidor más cercana (por ejemplo `us-central` o `southamerica-east1`) y confirma.

### 1.4 Aplicar las reglas de seguridad

1. Dentro de Firestore Database, ve a la pestaña **"Reglas"**.
2. Copia el contenido completo del archivo `firestore.rules` de este proyecto y pégalo, reemplazando las reglas por defecto.
3. Haz clic en **"Publicar"**.
4. Por defecto, el archivo usa el **modo abierto** (cualquiera puede leer/escribir) para que puedas probar la app de inmediato. Para producción, se recomienda cambiar a **modo autenticado**: sigue las instrucciones comentadas dentro del propio archivo `firestore.rules` y habilita **Authentication → Método de acceso → Correo/Contraseña** (o Google) en Firebase Console.

### 1.5 Crear las colecciones (opcional, se crean automáticamente)

Firestore crea las colecciones `empleados` y `asistencias` automáticamente la primera vez que guardas un documento desde la app (por ejemplo, al usar el formulario "Registro y Actualización de Datos" o la importación masiva). No es necesario crearlas manualmente.

Si prefieres cargarlas a mano, puedes crear documentos con esta estructura:

**Colección `empleados`:**
```json
{
  "nombre": "Carlos",
  "apellido": "Ramírez",
  "correo": "carlos.ramirez@empresa.com",
  "puesto": "Técnico de Laboratorio",
  "seguroAccidente": "Sí",
  "celular": "5555-1000",
  "direccion": "Ciudad de Guatemala",
  "estado": "Activo"
}
```

**Colección `asistencias`:**
```json
{
  "correo": "carlos.ramirez@empresa.com",
  "nombre": "Carlos",
  "apellido": "Ramírez",
  "sitioCurso": "Gabinete",
  "fecha": "2026-09-23",
  "hora": "07:15:00",
  "geolocalizacion": "14.585397, -90.585960",
  "epp": {
    "casco": true,
    "lentesSeguridad": true,
    "mascarilla": false,
    "taponesAuditivos": true,
    "chalecoReflectivo": true,
    "guantes": true,
    "botasPuntaAcero": true,
    "barbiquejo": false,
    "capaLluvia": false,
    "extintor": true
  },
  "equipo": {
    "moldesCilindros": true,
    "termometro": false,
    "conoAsentamiento": true
  }
}
```

---

## 2. Importación masiva de datos (desde el Excel del proyecto)

En la pestaña **"➕ Registro y Actualización de Datos"** encontrarás la sección **"Importación Masiva"**:

1. Exporta tu hoja de Excel "ASISTENCIA COMPLETA" como **CSV** (Archivo → Guardar como → CSV).
2. Asegúrate de que la primera fila tenga estos encabezados exactos: `correo,nombre,apellido,sitioCurso,fecha,hora,geolocalizacion`.
3. Arrastra o selecciona el archivo `.csv` (o `.json` si prefieres ese formato) en el recuadro de importación.
4. La app importará los registros en lotes automáticamente hacia Firestore.

También puedes preparar un archivo `.json` con un arreglo de objetos siguiendo la misma estructura mostrada en la sección anterior.

---

## 3. Ejecutar la aplicación localmente

Como el proyecto usa módulos ES6 (`type="module"`), debes servirlo con un servidor HTTP local (no funciona con `file://` directamente por restricciones CORS del navegador).

Con Python:
```bash
python3 -m http.server 8080
```

Con Node.js (usando el paquete `serve`):
```bash
npx serve .
```

Luego abre `http://localhost:8080` en tu navegador.

---

## 4. Subir el proyecto a GitHub

Desde la raíz del proyecto, ejecuta:

```bash
git init
git add .
git commit -m "Primera versión: Dashboard de Control de Asistencia y EPP"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

> Reemplaza `TU_USUARIO/TU_REPOSITORIO` con la ruta real de tu repositorio en GitHub. Si el repositorio aún no existe, créalo primero desde [https://github.com/new](https://github.com/new) (puedes dejarlo vacío, sin README, .gitignore ni licencia, para evitar conflictos con el primer push).

---

## 5. Desplegar en GitHub Pages (gratis)

1. Ve a tu repositorio en GitHub → pestaña **"Settings"**.
2. En el menú lateral izquierdo, haz clic en **"Pages"**.
3. En **"Build and deployment"**, en el campo **"Source"**, selecciona **"Deploy from a branch"**.
4. En **"Branch"**, selecciona `main` y la carpeta `/ (root)`. Haz clic en **"Save"**.
5. Espera 1–2 minutos. GitHub mostrará la URL pública de tu sitio, con este formato:
   ```
   https://TU_USUARIO.github.io/TU_REPOSITORIO/
   ```
6. Abre esa URL: tu dashboard estará en línea y conectado a tu proyecto de Firebase.

### Actualizaciones futuras

Cada vez que hagas cambios, súbelos con:
```bash
git add .
git commit -m "Descripción del cambio"
git push
```
GitHub Pages se actualizará automáticamente en 1–2 minutos.

---

## 6. Desplegar en Vercel (alternativa)

1. Ve a [https://vercel.com](https://vercel.com) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **"Add New… → Project"**.
3. Selecciona el repositorio que acabas de subir.
4. Como es un sitio estático (HTML/CSS/JS sin build step), deja el **Framework Preset** en **"Other"** y el **Output Directory** vacío o en `.`.
5. Haz clic en **"Deploy"**. En menos de un minuto tendrás una URL pública tipo `https://tu-proyecto.vercel.app`.

---

## 7. Autorizar el dominio en Firebase (importante)

Para que Firebase acepte peticiones desde tu sitio desplegado:

1. En Firebase Console, ve a **Authentication → Settings → Authorized domains** (si usas el modo autenticado).
2. Agrega tu dominio de GitHub Pages o Vercel, por ejemplo `tu-usuario.github.io` o `tu-proyecto.vercel.app`.

Si usas el **modo abierto** de las reglas de Firestore (por defecto), este paso no es estrictamente necesario, pero se recomienda pasar a modo autenticado antes de usar la app con datos reales de producción.

---

## 8. Resumen de funcionalidades

| Vista | Descripción |
|---|---|
| 📊 Dashboard General | KPIs, tendencia diaria, cumplimiento de EPP por ítem, distribución por sitio |
| ➕ Registro y Actualización | Formulario de marca de asistencia + importación masiva CSV/JSON |
| 🔍 Validación Diaria | Tabla "Quién Marcó vs Quién Faltó" por fecha |
| 👤 Historial por Empleado | Perfil, métricas individuales y tabla cronológica de marcas |
| 🧰 Detalle de Equipo y Auditoría | Checklist completo de EPP y herramientas por empleado/fecha |

---

## 9. Solución de problemas comunes

- **"Firebase: Error (auth/invalid-api-key)"**: revisa que copiaste correctamente los valores en `src/firebase-config.js`.
- **La app no carga datos y muestra el banner de demo**: significa que no pudo conectarse a Firestore o que las colecciones están vacías; verifica tu configuración y las reglas de seguridad.
- **Error de CORS al abrir `index.html` directamente**: debes servir el proyecto con un servidor local (ver sección 3), no abrirlo como archivo local.
- **Los cambios no se reflejan en GitHub Pages**: espera 1–2 minutos tras el `git push`, o revisa el estado del despliegue en la pestaña "Actions" de tu repositorio.
