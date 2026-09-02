// Service worker de Firebase Cloud Messaging (notificaciones push).
//
// Este archivo es INDEPENDIENTE de service-worker.js (el que habilita la PWA
// y el uso sin conexión) — FCM para Web requiere su propio service worker,
// registrado por separado desde index.html cuando el doctor activa las
// notificaciones (ver función activarNotificacionesPush en index.html).
//
// Aquí es donde llegan los mensajes push CUANDO LA APP ESTÁ CERRADA (o en
// segundo plano): el navegador despierta este archivo aunque no haya ninguna
// pestaña abierta, y nosotros mostramos la notificación con showNotification.
// Si la app está abierta y en primer plano, en cambio, el mensaje llega vía
// messaging.onMessage() dentro de index.html (ver ese archivo).
//
// IMPORTANTE: este archivo no puede leer el firebaseConfig de index.html
// (corre en un contexto aparte), así que la configuración va repetida aquí
// abajo. No son valores secretos (ver nota en index.html), pero si cambias
// tu proyecto de Firebase, actualiza AMBOS lugares.

importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCbxIVUXL30eZOJBOpuXWglUjDS2LmfYls",
  authDomain: "solucionesdentales.firebaseapp.com",
  projectId: "solucionesdentales",
  storageBucket: "solucionesdentales.firebasestorage.app",
  messagingSenderId: "437439340711",
  appId: "1:437439340711:web:697c8c4f25b04b8ab33b82",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "DMR Consultorio Dental";
  const body = payload?.notification?.body || "";
  const url = payload?.data?.url || "./";
  self.registration.showNotification(title, {
    body,
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    data: { url },
    tag: payload?.data?.tag || "dmr-citas",
  });
});

// Al tocar la notificación, abre la app (o enfoca la pestaña ya abierta).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
