/**
 * Cloud Function programada — notificaciones push de citas (DMR Consultorio Dental)
 * ===================================================================================
 * Corre cada 15 minutos. Para cada doctor con "notifySettings.enabled = true":
 *   - Si la hora actual coincide con "notifySettings.dayBeforeTime" → manda un
 *     aviso con sus citas de MAÑANA.
 *   - Si la hora actual coincide con "notifySettings.sameDayTime" → manda un
 *     aviso con sus citas de HOY.
 * El horario lo configura el administrador desde el panel "Administración"
 * de la app (ver AdminView / NotifyScheduleEditor en index.html).
 *
 * Requiere plan Blaze (pago por uso) de Firebase, porque usa Cloud Scheduler
 * + Cloud Functions. Ver README, sección "Notificaciones push", para cómo
 * activar el plan y desplegar esta función.
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// Zona horaria usada para interpretar los horarios que configura el admin
// (doctors/{uid}.notifySettings.dayBeforeTime / sameDayTime). Cambia esto si
// tus doctores están en otra zona — ver README.
const TIMEZONE = "America/Mexico_City";

/** Fecha (YYYY-MM-DD) y hora (HH:MM) actuales en TIMEZONE. */
function nowParts() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const map = {};
  fmt.formatToParts(new Date()).forEach((p) => { map[p.type] = p.value; });
  const hour = map.hour === "24" ? "00" : map.hour; // algunas plataformas devuelven "24:00" en vez de "00:00"
  return { date: `${map.year}-${map.month}-${map.day}`, hhmm: `${hour}:${map.minute}` };
}

/** Suma/resta días a una fecha "YYYY-MM-DD" (aritmética simple de calendario). */
function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Redondea "HH:MM" hacia abajo al cuarto de hora más cercano (00/15/30/45). */
function floorToQuarter(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const q = Math.floor(m / 15) * 15;
  return `${String(h).padStart(2, "0")}:${String(q).padStart(2, "0")}`;
}

/** Trae las citas (no canceladas) de un doctor para una fecha, con nombre de paciente. */
async function citasDelDia(ownerId, dateISO) {
  const snap = await db.collection("appointments")
    .where("ownerId", "==", ownerId)
    .where("date", "==", dateISO)
    .get();
  const citas = snap.docs.map((d) => d.data()).filter((a) => a.status !== "cancelada");
  citas.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  if (citas.length === 0) return { count: 0, resumen: "" };
  const patientIds = [...new Set(citas.map((c) => c.patientId).filter(Boolean))];
  const nombres = {};
  await Promise.all(patientIds.map(async (pid) => {
    try {
      const pSnap = await db.collection("patients").doc(pid).get();
      nombres[pid] = pSnap.exists ? (pSnap.data().name || "Paciente") : "Paciente";
    } catch (err) { nombres[pid] = "Paciente"; }
  }));
  const primeras = citas.slice(0, 3)
    .map((c) => `${c.time || ""} ${nombres[c.patientId] || "Paciente"}`.trim())
    .join(" · ");
  const resto = citas.length > 3 ? ` y ${citas.length - 3} más` : "";
  return { count: citas.length, resumen: `${primeras}${resto}` };
}

/** Envía el push a todos los tokens del doctor y limpia los tokens inválidos/expirados. */
async function enviarPush(doctorRef, tokens, title, body, tag) {
  if (!tokens || tokens.length === 0) return;
  const resp = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: { tag, url: "./" },
    webpush: { fcmOptions: { link: "./" } },
  });
  const invalidos = [];
  resp.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-argument") {
        invalidos.push(tokens[i]);
      }
      logger.warn("Fallo al enviar a un token:", code || r.error);
    }
  });
  if (invalidos.length > 0) {
    await doctorRef.update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidos) });
  }
}

exports.sendCitasReminders = onSchedule(
  { schedule: "every 15 minutes", timeZone: TIMEZONE, region: "us-central1" },
  async () => {
    const { date: today, hhmm } = nowParts();
    const currentSlot = floorToQuarter(hhmm);
    const tomorrow = shiftDate(today, 1);

    const doctoresSnap = await db.collection("doctors").where("notifySettings.enabled", "==", true).get();
    logger.info(`Revisando ${doctoresSnap.size} doctor(es) con recordatorios activos a las ${currentSlot} (${today}).`);

    for (const docSnap of doctoresSnap.docs) {
      const doctor = docSnap.data();
      const ref = docSnap.ref;
      const ns = doctor.notifySettings || {};
      const lastNotified = doctor.lastNotified || {};
      const tokens = doctor.fcmTokens || [];
      if (tokens.length === 0) continue;

      // Aviso de citas de MAÑANA (recordatorio "un día antes").
      if (ns.dayBeforeTime && floorToQuarter(ns.dayBeforeTime) === currentSlot && lastNotified.dayBefore !== today) {
        try {
          const { count, resumen } = await citasDelDia(docSnap.id, tomorrow);
          if (count > 0) {
            await enviarPush(ref, tokens, "Citas de mañana",
              `Tienes ${count} cita${count === 1 ? "" : "s"} mañana: ${resumen}`, "dmr-citas-manana");
          }
          await ref.update({ "lastNotified.dayBefore": today });
        } catch (err) { logger.error(`Error en aviso "día antes" para ${docSnap.id}:`, err); }
      }

      // Aviso de citas de HOY (recordatorio "mismo día").
      if (ns.sameDayTime && floorToQuarter(ns.sameDayTime) === currentSlot && lastNotified.sameDay !== today) {
        try {
          const { count, resumen } = await citasDelDia(docSnap.id, today);
          if (count > 0) {
            await enviarPush(ref, tokens, "Citas de hoy",
              `Tienes ${count} cita${count === 1 ? "" : "s"} hoy: ${resumen}`, "dmr-citas-hoy");
          }
          await ref.update({ "lastNotified.sameDay": today });
        } catch (err) { logger.error(`Error en aviso "mismo día" para ${docSnap.id}:`, err); }
      }
    }
  }
);

/**
 * Cloud Function pública — enlace de confirmar/reagendar cita por WhatsApp
 * ===================================================================================
 * El botón "Confirmar/Recordar por WhatsApp" de la app (ver WhatsAppButton en
 * index.html) incluye en el mensaje un enlace único de la cita que apunta aquí:
 *   https://.../confirmarCita?id=<idDeLaCita>&token=<confirmToken>
 *
 * La abre el PACIENTE, sin necesitar cuenta ni contraseña — por eso esta función
 * NO exige autenticación (a diferencia del resto de la app) y usa el "token" que
 * se genera al crear cada cita (campo `confirmToken` en appointments/{id}) para
 * verificar que quien abre el enlace de verdad tiene el de ESA cita.
 *
 * Flujo:
 *  1) GET .../confirmarCita?id=..&token=..            → muestra la cita con dos
 *     botones ("Confirmar" y "Necesito reagendar").
 *  2) GET .../confirmarCita?id=..&token=..&action=confirmar  → guarda
 *     appointments/{id}.status = "confirmada" y muestra una pantalla de éxito.
 *  3) GET .../confirmarCita?id=..&token=..&action=reagendar  → guarda
 *     appointments/{id}.status = "reagendar_solicitado" (aparece como "Pidió
 *     reagendar" en Citas/Panel, para que el doctor la vea y contacte al
 *     paciente) y muestra una pantalla de confirmación.
 * En los tres casos escribe con el SDK de administrador, así que no necesita
 * (ni puede) tocar las reglas de seguridad de Firestore.
 */

const MESES_ES_PUBLICO = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Fecha "YYYY-MM-DD" → "3 de junio de 2026", para las páginas públicas. */
function formatearFechaPublica(iso) {
  if (!iso || typeof iso !== "string") return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MESES_ES_PUBLICO[m - 1]} de ${y}`;
}

/** Escapa texto que viene de Firestore antes de insertarlo en HTML. */
function escaparHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/** Plantilla común (tarjeta centrada) para todas las páginas públicas del enlace. */
function paginaPublicaHTML(tituloPestana, contenidoHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escaparHtml(tituloPestana)} · DMR Consultorio Dental</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #F0F6F6; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 24px; }
  .tarjeta { background: #fff; border-radius: 16px; padding: 32px 26px; max-width: 420px; width: 100%;
    box-shadow: 0 4px 18px rgba(11,31,51,0.10); text-align: center; }
  h1 { font-size: 19px; color: #0B1F33; margin: 0 0 10px; }
  p { font-size: 14.5px; color: #5B7480; line-height: 1.55; margin: 0 0 22px; }
  .icono { font-size: 38px; margin-bottom: 8px; line-height: 1; }
  .boton { display: block; width: 100%; padding: 13px 18px; border-radius: 10px; border: none;
    font-size: 15px; font-weight: 700; text-decoration: none; margin-bottom: 12px; cursor: pointer; }
  .boton-confirmar { background: #1E8C8C; color: #fff; }
  .boton-reagendar { background: #fff; color: #0B1F33; border: 1.5px solid #DCE6E6; }
  .detalle { background: #F7FAFA; border-radius: 10px; padding: 14px 16px; margin-bottom: 22px;
    text-align: left; font-size: 13.5px; color: #0B1F33; }
  .detalle div + div { margin-top: 6px; }
  .detalle b { color: #1E8C8C; }
</style>
</head>
<body><div class="tarjeta">${contenidoHtml}</div></body>
</html>`;
}

function paginaPublicaError(mensaje) {
  return paginaPublicaHTML("Enlace no disponible", `
    <div class="icono">⚠️</div>
    <h1>No pudimos abrir tu cita</h1>
    <p>${escaparHtml(mensaje)}</p>
  `);
}

function paginaPublicaResultado({ icono, titulo, mensaje }) {
  return paginaPublicaHTML(titulo, `
    <div class="icono">${icono}</div>
    <h1>${escaparHtml(titulo)}</h1>
    <p>${escaparHtml(mensaje)}</p>
  `);
}

function paginaPublicaOpciones({ id, token, nombrePaciente, fecha, hora, motivo }) {
  const base = `?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
  return paginaPublicaHTML("Tu cita", `
    <div class="icono">🦷</div>
    <h1>Hola, ${escaparHtml(nombrePaciente)}</h1>
    <p>Este es el detalle de tu próxima cita. Confírmala o avísanos si necesitas reagendar.</p>
    <div class="detalle">
      <div><b>Fecha:</b> ${escaparHtml(formatearFechaPublica(fecha))}</div>
      <div><b>Hora:</b> ${escaparHtml(hora || "")}</div>
      ${motivo ? `<div><b>Motivo:</b> ${escaparHtml(motivo)}</div>` : ""}
    </div>
    <a class="boton boton-confirmar" href="${base}&action=confirmar">✅ Confirmar mi cita</a>
    <a class="boton boton-reagendar" href="${base}&action=reagendar">🔁 Necesito reagendar</a>
  `);
}

exports.confirmarCita = onRequest({ region: "us-central1", cors: true }, async (req, res) => {
  try {
    const id = String(req.query.id || "").trim();
    const token = String(req.query.token || "").trim();
    const action = String(req.query.action || "").trim();

    if (!id || !token) {
      res.status(400).send(paginaPublicaError(
        "Este enlace no es válido o está incompleto. Pide a tu consultorio que te envíe uno nuevo."));
      return;
    }

    const ref = db.collection("appointments").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).send(paginaPublicaError("No encontramos esta cita. Es posible que ya no exista."));
      return;
    }
    const cita = snap.data();
    if (!cita.confirmToken || cita.confirmToken !== token) {
      res.status(403).send(paginaPublicaError("Este enlace no es válido."));
      return;
    }

    let nombrePaciente = "Paciente";
    if (cita.patientId) {
      try {
        const pSnap = await db.collection("patients").doc(cita.patientId).get();
        if (pSnap.exists) nombrePaciente = pSnap.data().name || nombrePaciente;
      } catch (err) { logger.warn("confirmarCita: no se pudo leer el paciente:", err); }
    }

    if (cita.status === "cancelada") {
      res.status(200).send(paginaPublicaResultado({
        icono: "ℹ️", titulo: "Esta cita fue cancelada",
        mensaje: "El consultorio canceló esta cita. Si tienes dudas, contáctalos directamente.",
      }));
      return;
    }

    if (action === "confirmar") {
      await ref.update({
        status: "confirmada",
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        confirmedVia: "whatsapp_link",
      });
      res.status(200).send(paginaPublicaResultado({
        icono: "✅", titulo: "¡Cita confirmada!",
        mensaje: `Gracias, ${nombrePaciente}. Tu cita del ${formatearFechaPublica(cita.date)} a las ${cita.time || ""} quedó confirmada.`,
      }));
      return;
    }

    if (action === "reagendar") {
      await ref.update({
        status: "reagendar_solicitado",
        rescheduleRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.status(200).send(paginaPublicaResultado({
        icono: "🔁", titulo: "¡Listo, avisamos al consultorio!",
        mensaje: `${nombrePaciente}, ya avisamos que necesitas reagendar tu cita del ${formatearFechaPublica(cita.date)}. Te contactarán pronto para acordar una nueva fecha.`,
      }));
      return;
    }

    // Sin "action" todavía: mostrar la pantalla con los dos botones.
    res.status(200).send(paginaPublicaOpciones({
      id, token, nombrePaciente, fecha: cita.date, hora: cita.time, motivo: cita.reason,
    }));
  } catch (err) {
    logger.error("Error en confirmarCita:", err);
    res.status(500).send(paginaPublicaError("Ocurrió un error inesperado. Intenta de nuevo en unos minutos."));
  }
});
