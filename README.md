# DMR Consultorio Dental

App de gestión para consultorio dental (pacientes, citas, pagos, odontograma con notas por
diente y reportes PDF) hecha en React (vía CDN, sin proceso de build) y configurada como
**PWA (Progressive Web App)**: se puede "instalar" desde el navegador en computadora o
celular y funciona sin conexión una vez cargada.

Los datos (cuentas, pacientes, citas y pagos) se guardan en **Firebase** (Authentication +
Firestore), no en el navegador: puedes iniciar sesión con el mismo correo desde cualquier
dispositivo y ver la misma información, sincronizada en tiempo real.

## Estructura

```
index.html            → la app completa (React + lógica + configuración de Firebase)
manifest.json          → metadatos de la PWA (nombre, íconos, colores)
service-worker.js      → habilita instalación y uso sin internet
firestore.rules        → reglas de seguridad de la base de datos (quién puede leer/escribir qué)
icons/                 → íconos de la app en distintos tamaños
```

## 1. Conectar Firebase (necesario antes de usar la app)

### 1.1 Crear el proyecto

1. Entra a https://console.firebase.google.com/ e inicia sesión con tu cuenta de Google.
2. Clic en **Agregar proyecto**, ponle un nombre (por ejemplo `dmr-consultorio-dental`) y
   sigue el asistente (puedes desactivar Google Analytics, no es necesario).

### 1.2 Activar Authentication (cuentas de acceso)

1. En el menú lateral entra a **Compilación → Authentication** → **Comenzar**.
2. En la pestaña **Sign-in method**, activa el proveedor **Correo electrónico/contraseña**.

### 1.3 Crear la base de datos Firestore

1. En el menú lateral entra a **Compilación → Firestore Database** → **Crear base de datos**.
2. Elige la ubicación más cercana (por ejemplo `us-central` o `southamerica-east1`) y
   selecciona **Iniciar en modo de producción** (las reglas de seguridad del paso 1.5 son
   las que de verdad protegen los datos).

### 1.4 Registrar la app web y copiar la configuración

1. En **Configuración del proyecto** (ícono de engrane) → pestaña **General** → sección
   "Tus apps" → clic en el ícono `</>` (Web) para agregar una app web.
2. Ponle un apodo (por ejemplo "DMR Dental Web") y clic en **Registrar app**. No necesitas
   Firebase Hosting.
3. Firebase te mostrará un objeto `firebaseConfig` así:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "dmr-consultorio-dental.firebaseapp.com",
     projectId: "dmr-consultorio-dental",
     storageBucket: "dmr-consultorio-dental.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef",
   };
   ```
4. Abre `index.html` de este proyecto, busca el bloque `CONFIGURACIÓN DE FIREBASE` (cerca
   del inicio) y **reemplaza esos 6 valores de ejemplo con los tuyos**. Estos valores no son
   secretos (viajan al navegador de cualquier forma) — lo que realmente protege tus datos
   son las reglas de seguridad del siguiente paso.

### 1.5 Publicar las reglas de seguridad

1. En Firestore Database → pestaña **Rules**.
2. Copia todo el contenido del archivo `firestore.rules` de este proyecto y pégalo,
   reemplazando lo que haya.
3. Clic en **Publish/Publicar**.

Estas reglas hacen que cada cuenta solo pueda ver y modificar sus propios pacientes, citas
y pagos — nunca los de otra cuenta, aunque compartan el mismo proyecto de Firebase.

## 2. Subirlo a GitHub

Si aún no tienes el repositorio creado:

1. Entra a https://github.com/new y crea un repositorio (por ejemplo `dmr-consultorio-dental`).
   No marques la casilla de "Add a README" si vas a subir esta carpeta tal cual.
2. En tu computadora, dentro de esta carpeta, corre:

```bash
git init
git add .
git commit -m "App de consultorio dental con Firebase (Auth + Firestore) y PWA"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/dmr-consultorio-dental.git
git push -u origin main
```

Cambia `TU_USUARIO` y el nombre del repo por los tuyos. Si el repo ya existe y solo quieres
actualizarlo, basta con:

```bash
git add .
git commit -m "Conectar Firebase (Auth + Firestore)"
git push
```

> El `firebaseConfig` que pegaste en `index.html` queda visible en el repositorio (aunque
> sea público) — eso es normal y seguro para una app web de Firebase, siempre y cuando
> hayas publicado las reglas de seguridad del paso 1.5.

## 3. Publicarlo como sitio web (necesario para que la PWA y Firebase funcionen bien)

Los service workers (lo que permite "instalar" la app y usarla sin internet) y Firebase
Authentication requieren HTTPS — no funcionan bien abriendo el archivo directo desde tu
computadora (`file://`). GitHub Pages te da hosting con HTTPS gratis:

1. En GitHub, entra a tu repo → **Settings** → **Pages**.
2. En "Build and deployment", elige **Deploy from a branch**.
3. Selecciona la rama `main` y la carpeta `/ (root)`.
4. Guarda. En un par de minutos tu app estará disponible en:
   `https://TU_USUARIO.github.io/dmr-consultorio-dental/`
5. **Autoriza ese dominio en Firebase:** Authentication → pestaña **Settings** →
   **Authorized domains** → agrega `TU_USUARIO.github.io` (GitHub Pages normalmente ya
   viene autorizado por defecto junto con `localhost`, pero conviene revisarlo).

## 4. Instalarla como app (PWA)

Abre esa URL en Chrome/Edge (computadora o Android):

- Verás un ícono de "Instalar app" en la barra de direcciones, o
- Menú ⋮ → "Instalar DMR Consultorio Dental" / "Agregar a pantalla de inicio".

En iPhone (Safari): botón compartir → **Agregar a pantalla de inicio**.

Una vez instalada, abre y cierra la app normal, sin la barra del navegador, con su propio
ícono.

## Notas importantes

- **Cuentas de acceso (login):** ahora usan Firebase Authentication. El mismo correo y
  contraseña funcionan en cualquier dispositivo — te registras una vez y luego inicias
  sesión desde donde sea.
- **Datos (pacientes, citas, pagos, odontograma, archivos):** se guardan en Firestore,
  separados por cuenta (cada usuario ve solo los suyos) y se sincronizan en tiempo real
  entre todos tus dispositivos.
- **Modo sin conexión:** la app cachea la interfaz (service worker) y también los datos
  más recientes de Firestore en el dispositivo (persistencia offline). Puedes seguir
  viendo pacientes, citas y pagos sin internet; los cambios que hagas se guardan
  localmente y se sincronizan solos en cuanto vuelve la conexión.
- **Archivos de pacientes:** por ahora solo se guarda el nombre/tipo/fecha del archivo
  (metadatos), no el archivo en sí. Para subir el archivo real (radiografías, etc.) haría
  falta conectar además Firebase Storage — no incluido en esta versión.
- **Actualizar el service worker:** cada vez que subas cambios al `index.html`, el
  service worker los detecta y actualiza el caché en segundo plano; el usuario los verá
  la próxima vez que recargue la app estando en línea.
- **Costo:** Firebase tiene un plan gratuito (Spark) con cuotas generosas de lectura/
  escritura en Firestore y usuarios de Authentication — más que suficiente para un
  consultorio. Puedes revisar tu uso en Firebase Console → Uso y facturación.
