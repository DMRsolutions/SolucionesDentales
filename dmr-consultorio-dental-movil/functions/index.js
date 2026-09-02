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
