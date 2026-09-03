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
index.html               → la app completa (React + lógica + configuración de Firebase)
confirmar.html           → página pública "Confirmar/Reagendar cita" que abre el paciente
                            desde WhatsApp — ver sección 5.3
manifest.json             → metadatos de la PWA (nombre, íconos, colores)
service-worker.js         → habilita instalación y uso sin internet
firebase-messaging-sw.js  → service worker de notificaciones push (ver sección 6)
firestore.rules           → reglas de seguridad de la base de datos (quién puede leer/escribir qué)
icons/                    → íconos de la app en distintos tamaños
functions/                → Cloud Function programada que envía las notificaciones push (ver sección 6)
firebase.json, .firebaserc → configuración del Firebase CLI para desplegar functions/
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

## 5. Funciones nuevas: usuario de acceso, planes, WhatsApp y presupuestos

### 5.1 Iniciar sesión con nombre de usuario

Al registrarse, el doctor elige un **nombre de usuario** (además de su correo). Desde
entonces puede iniciar sesión escribiendo su usuario o su correo, indistintamente.
Internamente se guarda un documento en la colección `usernames` (`{uid, email}`) que
la app consulta para encontrar el correo antes de llamar a Firebase Auth. Este
documento es de lectura pública en las reglas (es necesario poder consultarlo
*antes* de iniciar sesión), así que el correo de cada doctor queda visible para
quien sepa su nombre de usuario — igual de expuesto que el `firebaseConfig`, no es
información con la que se pueda hacer algo sin la contraseña.

### 5.2 Planes y control de funciones (para ti, como dueño del sistema)

Cada doctor tiene un documento en `doctors/{uid}` con un campo `plan`:
**Básico** o **Premium**. Todo doctor nuevo empieza en **Básico**. Las
funciones nuevas están condicionadas al plan (ver `FEATURE_MIN_PLAN` en
`index.html` si quieres cambiar qué función va en qué plan):

- **Básico** (incluido siempre): pacientes/expedientes, citas y seguimiento,
  pagos, reportes, subida de archivos (radiografías/fotos), y el plan de
  tratamiento *sin* costos (solo el listado de procedimientos por paciente).
- **Premium**: todo lo de Básico, más — odontograma, aviso/banner de citas
  próximas al abrir el sistema, colores de proximidad en citas,
  confirmaciones/recordatorios por WhatsApp (incluyendo el enlace de
  confirmar/reagendar, ver 5.3), costos y presupuesto dentro de los planes de
  tratamiento (con abono/liquidación en Pagos y descarga de PDF), recetas,
  cierre de sesión automático por inactividad (10 minutos sin actividad; ver
  `INACTIVITY_LIMIT_MS` en `index.html` para cambiar el tiempo), y las
  alertas del Panel general de **tratamientos pendientes** y **pacientes con
  citas canceladas** (los "presupuestos sin aceptar" y "saldos pendientes"
  ya eran Premium por depender de los costos de los planes de tratamiento).

**Nota sobre el plan "Pro" anterior:** si tenías doctores con ese plan
intermedio, siguen funcionando exactamente igual que Premium (no perdieron
ninguna función). Al entrar como administrador vas a ver un aviso arriba de
la lista de doctores con un botón para pasarlos formalmente a Premium con un
solo clic — no hace falta tocar nada en Firebase Console.

Para poder cambiarle el plan a un doctor necesitas ser **administrador**:

1. En Firebase Console → Firestore Database → crea (si no existe) la colección
   `admins`.
2. Agrega un documento cuyo **ID sea tu propio uid** (lo ves en Authentication →
   Users, columna "User UID"). No necesita campos, puede quedar vacío.
3. Inicia sesión en la app con esa cuenta: verás un nuevo apartado
   **"Administración"** en el menú, con la lista de doctores y botones para
   asignarles Básico / Premium. Un doctor nunca puede subirse el plan a sí
   mismo — solo tú, desde ahí.

### 5.3 Confirmaciones y recordatorios de cita por WhatsApp

No hay una API de WhatsApp Business conectada (eso requeriría un servicio de pago
aparte, como Twilio o Meta Cloud API). Lo que sí incluye la app es un botón
**"Confirmar/Recordar por WhatsApp"** en cada cita: abre `wa.me` con el número del
paciente y el mensaje ya escrito — el doctor solo revisa y presiona enviar, usando
su propio WhatsApp (el que tenga iniciado en su celular o en WhatsApp Web). Cada
doctor guarda su número de contacto en **Ajustes**, dentro de la app.

**Enlace de confirmar/reagendar (se actualiza solo, sin que el doctor haga nada,
y sin plan de pago de Firebase).** El mensaje que se manda al paciente incluye
además un enlace único de su cita, que abre `confirmar.html` (un archivo más de
este mismo proyecto). Cuando el PACIENTE lo abre (no necesita cuenta ni
contraseña) ve una pantalla con dos botones:

- **"Confirmar mi cita"** → el sistema cambia sola el estado de la cita a
  *Confirmada* en Firestore.
- **"Necesito reagendar"** → el sistema cambia sola el estado a *Pidió reagendar*
  (aparece como una etiqueta morada en Citas y en el Panel general); el doctor la
  ve y contacta al paciente para acordar nueva fecha, y luego cambia el estado a
  mano cuando la reagende.

`confirmar.html` no usa Cloud Functions ni requiere el plan Blaze: inicia una
sesión anónima de Firebase y escribe directo a Firestore, protegida por un
token único generado para cada cita (nadie puede adivinar o abrir el enlace de
la cita de otro paciente) y por reglas de seguridad que solo permiten cambiar
el campo `status` de esa cita, nunca nada más (ver `firestore.rules`). Para
activarlo:

1. **Activa el inicio de sesión anónimo:** Firebase Console → **Authentication**
   → pestaña **Sign-in method** → **Anonymous** → Habilitar. Es gratis, no
   requiere plan Blaze.
2. Publica las reglas actualizadas de `firestore.rules` (Firestore Database →
   pestaña **Rules** → pega el contenido del archivo → **Publish**), igual que
   en el paso 1.5.
3. Sube `confirmar.html` junto con el resto del proyecto (ya viaja en la misma
   carpeta) — al publicarlo en GitHub Pages (paso 3) queda disponible solo en
   este mismo sitio, sin configuración aparte.
4. Listo — las citas que se agenden desde ahora incluirán el enlace en el
   mensaje de WhatsApp automáticamente. Las citas creadas antes de este cambio
   no tienen el enlace (no se puede generar en retroactivo), pero el resto del
   mensaje se manda igual.

### 5.4 Colores de proximidad de las citas

En el Panel y en Citas, las citas próximas se resaltan por color: hoy (rojo),
mañana o pasado (ámbar), en la semana (azul); esto ayuda a detectar de un vistazo
qué citas se acercan. Además, en el Panel general aparece un aviso/banner cuando
hay citas hoy o mañana, visible cada vez que se abre el sistema (plan Premium).
Para avisos que lleguen aunque la app esté cerrada, ve la sección
"6. Notificaciones push" más abajo.

### 5.5 Planes de tratamiento y presupuestos

Dentro del expediente de cada paciente, la pestaña **"Plan de tratamiento"**
(Básico) o **"Planes/Presupuestos"** (Premium) permite armar un plan con
procedimientos (diente, procedimiento y, en Premium, costo), calcular el total
automáticamente, darle seguimiento (Propuesto → Aceptado → En progreso →
Completado) y — solo en Premium — descargar un PDF de presupuesto para
entregar al paciente. En Básico, el mismo plan se guarda sin costos: sirve
como checklist clínico y de seguimiento, sin la parte de presupuesto.

Dentro del expediente de cada paciente, la pestaña **"Planes/Presupuestos"**
permite armar un plan con procedimientos (diente, procedimiento, costo), calcular
el total automáticamente, darle seguimiento (Propuesto → Aceptado → En progreso →
Completado) y descargar un PDF de presupuesto para entregar al paciente.

**Nota:** al menos un procedimiento necesita traer texto en "Procedimiento" para
poder guardar el plan (el diente es opcional, el costo se toma como 0 si se deja
vacío) — si no, el botón "Guardar plan" muestra un aviso en lugar de no hacer nada.

### 5.6 Pagos: presupuestos con abono/liquidación + pagos sueltos (Premium)

La pestaña **"Pagos"** de cada paciente, en un doctor **Premium**, tiene dos
partes (en **Básico** solo se ve la parte 2, ya que ahí no hay costos/presupuesto):

1. **Presupuestos del paciente** — lista automáticamente los presupuestos creados
   en la pestaña "Planes/Presupuestos", con su total, lo abonado hasta ahora y lo
   que resta. Cada uno tiene un botón **"Registrar abono"** (con un atajo para
   "Liquidar total") que va sumando pagos parciales hasta completar el total.
2. **Pagos sin presupuesto** — la tabla y el botón **"Agregar pago"** de siempre,
   para cobros que no vienen de un presupuesto generado (por ejemplo, una consulta
   suelta). Ambas opciones conviven: si no hay presupuesto, se sigue pudiendo
   registrar el pago directo.

Internamente, cada abono se guarda como un documento normal en `payments` con un
campo nuevo `planId` que lo liga al presupuesto; los pagos sin `planId` son los
"sueltos" de siempre.

### 5.7 Recetas (recetario numerado con respaldo, Premium)

La pestaña **"Recetas"** del expediente permite generar una receta con diagnóstico
(opcional), uno o más medicamentos con sus indicaciones/dosis y notas generales.
Cada receta:

- Recibe un **folio consecutivo** (`R-000001`, `R-000002`, …) que nunca se repite,
  asignado por doctor mediante una transacción de Firestore
  (`doctors/{uid}.recetaCounter`).
- Queda **guardada en Firestore como respaldo permanente**: puedes volver a
  cualquier receta anterior del paciente y reabrirla cuando quieras, aunque
  cambies de dispositivo.
- Se puede **ver/imprimir en PDF** desde el botón de descarga: abre una vista
  lista para imprimir con encabezado (nombre del consultorio y tu cédula
  profesional, configurables en **Ajustes**), folio, fecha, paciente, la tabla de
  medicamentos y una línea para firma y sello.

Para que el encabezado de tus recetas se vea completo, llena **Ajustes → Cédula
profesional** y **Nombre del consultorio**.

## 6. Notificaciones push (citas de hoy / mañana, aunque la app esté cerrada)

El sistema puede avisar a cada doctor, con una notificación push en su celular o
computadora, sus citas de **hoy** y de **mañana** — y llega aunque tenga la app
cerrada. El **horario** de esos avisos (a qué hora llega el de "mañana" y a qué
hora el de "hoy") lo define **el administrador, doctor por doctor**, desde el
panel de Administración — no cada doctor. Cada doctor solo activa las
notificaciones **en su propio dispositivo** desde Ajustes.

### 6.1 Qué tan "en segundo plano" llega

Es una notificación push real (Firebase Cloud Messaging / Web Push), no un
simple aviso dentro de la app:

- **Android** (Chrome, o la app instalada): llega igual que una app nativa,
  aunque el navegador esté cerrado.
- **Computadora** (Chrome/Edge): llega mientras el navegador siga corriendo en
  segundo plano (lo normal, incluso con todas las ventanas cerradas, salvo que
  el doctor haya cerrado Chrome por completo desde el administrador de tareas).
- **iPhone (Safari)**: requiere iOS 16.4 o más reciente **y** que el doctor haya
  instalado la app a su pantalla de inicio (ver sección "4. Instalarla como
  app"). Sin eso, Safari no puede recibir push en segundo plano — es una
  limitación de Apple, no de esta app.

### 6.2 Qué necesitas activar en Firebase (una sola vez)

1. **Plan Blaze:** los recordatorios programados usan Cloud Functions +
   Cloud Scheduler, que requieren el plan de pago por uso (Blaze) — necesitas
   una tarjeta registrada. Firebase Console → engrane ⚙️ → **Uso y
   facturación** → **Cambiar plan** → Blaze. El volumen de este sistema
   (un puñado de doctores, unas cuantas ejecuciones al día) normalmente cae
   dentro de las cuotas gratuitas de Blaze o cuesta centavos al mes; revisa tu
   uso ahí mismo si quieres confirmarlo.
2. **Generar la clave VAPID:** Firebase Console → engrane ⚙️ → **Configuración
   del proyecto** → pestaña **Cloud Messaging** → sección **Web configuration**
   → **Generate key pair**. Copia la clave que aparece (empieza distinto a la
   `apiKey`, es más larga) y pégala en `index.html`, en la constante
   `VAPID_KEY` (busca `PEGA_AQUI_TU_VAPID_KEY_PUBLICA`).
3. **Instalar Firebase CLI** (una sola vez en tu computadora):
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
4. **Desplegar la función programada:** dentro de la carpeta de este proyecto
   (donde está `firebase.json`):
   ```bash
   firebase deploy --only functions
   ```
   Esto crea la función `sendCitasReminders` (revisa cada 15 minutos si algún
   doctor tiene un aviso que enviar en ese momento) y su tarea de Cloud
   Scheduler correspondiente. Si cambias la lógica en `functions/index.js`,
   vuelve a correr este mismo comando para actualizarla.
5. **Publica las reglas actualizadas** de `firestore.rules` (ver sección 1.5)
   — se agregó protección para que solo un admin pueda cambiar el horario de
   avisos de un doctor.

### 6.3 Cómo se usa dentro de la app

- **El administrador**, en **Administración**, ve debajo de cada doctor un
  bloque "Recordatorios push de citas" con una casilla para activarlos y dos
  horas: "Aviso de citas de MAÑANA" y "Aviso de citas de HOY". Puedes dejar
  cualquiera de las dos vacía si solo quieres uno de los dos avisos. Las horas
  se redondean a cuartos de hora porque el servidor revisa cada 15 minutos.
- **Cada doctor**, en **Ajustes → Notificaciones**, presiona "Activar
  notificaciones en este dispositivo" (el navegador pedirá permiso). Eso
  registra ese dispositivo — el doctor puede repetirlo en cuantos dispositivos
  use (celular y computadora, por ejemplo) y todos recibirán el aviso. Ahí
  mismo ve, de forma informativa, el horario que le configuró el
  administrador.
- Si un doctor nunca activa notificaciones en ningún dispositivo, o si el
  administrador no le configura horario, simplemente no le llega nada — no
  hay ningún efecto secundario.

### 6.4 Notas técnicas

- El texto del aviso incluye cuántas citas hay y los primeros pacientes/horas
  del día; las citas marcadas como "Cancelada" no cuentan. Si no hay citas ese
  día, no se manda ningún aviso (para no generar ruido).
- Si un token de notificación deja de ser válido (el doctor desinstaló la app,
  borró datos del navegador, etc.), la función lo detecta y lo quita solo de
  `doctors/{uid}.fcmTokens` en el siguiente envío fallido.
- La zona horaria usada para interpretar los horarios es `America/Mexico_City`
  (constante `TIMEZONE` en `functions/index.js`) — cámbiala ahí si tus doctores
  están en otra zona.

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
