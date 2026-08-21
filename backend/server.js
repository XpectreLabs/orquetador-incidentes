import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables tanto de backend como de agent
dotenv.config();
dotenv.config({ path: path.join(__dirname, "../agent/.env") });

import * as store from "./store.js";
import * as sim from "./simulators.js";
import { runIncident } from "../agent/agent.js";

const app = express();
app.use(cors());
app.use(express.json());

// Servir archivos estáticos del Frontend
app.use(express.static(path.join(__dirname, "../frontend")));

const PORT = process.env.PORT || 3000;

// --- Cargar seed data al arrancar ---
function loadSeedData() {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "./seed-incidents.json"), "utf-8"));
  seed.forEach(inc => store.createIncident({
    ...inc,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));
}
loadSeedData();

function getRunbooks() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "./runbooks.json"), "utf-8"));
}

// ---------- ENDPOINTS PARA EL FRONTEND ----------

app.get("/api/incidents", (req, res) => {
  const { status, severity } = req.query;
  res.json({ incidents: store.listIncidents({ status, severity }) });
});

app.get("/api/incidents/:id", (req, res) => {
  const inc = store.getIncident(req.params.id);
  if (!inc) return res.status(404).json({ error: "no encontrado" });
  res.json(inc);
});

app.get("/api/incidents/:id/events", (req, res) => {
  res.json({ incident_id: req.params.id, events: store.getEvents(req.params.id) });
});

app.get("/api/incidents/:id/status", (req, res) => {
  const inc = store.getIncident(req.params.id);
  if (!inc) return res.status(404).json({ error: "no encontrado" });
  res.json({ status: inc.status });
});

// Endpoint para disparar el agente directamente desde la UI
app.post("/api/incidents/:id/run", async (req, res) => {
  try {
    const inc = store.getIncident(req.params.id);
    if (!inc) return res.status(404).json({ error: "incidente no encontrado" });

    const result = await runIncident(req.params.id);
    res.json({ success: true, result });
  } catch (err) {
    console.error("Error al ejecutar agente:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/incidents", (req, res) => {
  const id = `inc_${Date.now()}`;
  const incident = store.createIncident({
    id,
    ...req.body,
    status: "nuevo",
    severity: null,
    type: null,
    confidence: null,
    runbook_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  res.status(201).json(incident);
});

app.post("/api/incidents/:id/approve", async (req, res) => {
  const inc = store.updateIncident(req.params.id, { status: "ejecutando" });
  store.addEvent(req.params.id, {
    actor: "humano",
    event_type: "aprobacion_otorgada",
    payload: { approved_by: req.body.approved_by || "Operador SRE (Demo)" },
    status_before: "pendiente_aprobacion",
    status_after: "ejecutando",
    success: true
  });

  // Reanudar el agente automáticamente tras la aprobación
  setTimeout(async () => {
    try {
      await runIncident(req.params.id);
    } catch (e) {
      console.error("Error al reanudar agente tras aprobación:", e);
    }
  }, 100);

  res.json(inc);
});

app.post("/api/incidents/:id/reject", (req, res) => {
  const inc = store.updateIncident(req.params.id, { status: "escalado" });
  store.addEvent(req.params.id, {
    actor: "humano",
    event_type: "aprobacion_rechazada",
    payload: { rejected_by: req.body.rejected_by || "Operador SRE (Demo)" },
    status_before: "pendiente_aprobacion",
    status_after: "escalado",
    success: false
  });
  res.json(inc);
});

app.get("/api/runbooks", (req, res) => {
  res.json({ runbooks: getRunbooks() });
});

// Endpoint para reiniciar la demo
app.post("/api/reset", (req, res) => {
  store.incidents.clear();
  store.events.clear();
  loadSeedData();
  res.json({ success: true, message: "Datos de demo restaurados" });
});

// ---------- ENDPOINTS QUE USA EL AGENTE (tools) ----------

app.get("/tools/context/:id", (req, res) => {
  const inc = store.getIncident(req.params.id);
  if (!inc) return res.status(404).json({ error: "no encontrado" });
  res.json({ ...inc, previous_events: store.getEvents(req.params.id) });
});

app.get("/tools/runbooks", (req, res) => {
  const { type, severity } = req.query;
  let list = getRunbooks();
  if (type) list = list.filter(r => r.applicable_types.includes(type));
  if (severity) list = list.filter(r => r.applicable_severities.includes(severity));
  res.json({ runbooks: list });
});

app.post("/tools/check_status", async (req, res) => {
  const result = await sim.checkSystemStatus(req.body);
  res.json(result);
});

app.post("/tools/restart", async (req, res) => {
  const result = await sim.restartService(req.body);
  res.json(result);
});

app.post("/tools/rollback", async (req, res) => {
  const inc = store.getIncident(req.body.incident_id);
  if (inc && inc.status !== "ejecutando" && inc.status !== "resuelto") {
    return res.status(403).json({ error: "Acción de rollback requiere aprobación previa del operador" });
  }
  const result = await sim.rollbackDeployment(req.body);
  res.json(result);
});

app.post("/tools/scale", async (req, res) => {
  const result = await sim.scaleResource(req.body);
  res.json(result);
});

app.post("/tools/notify_human", (req, res) => {
  store.updateIncident(req.body.incident_id, { status: "pendiente_aprobacion" });
  res.json({ notified: true });
});

app.post("/tools/log", (req, res) => {
  const { incident_id, actor, event_type, payload, status_before, status_after } = req.body;
  
  const updates = {};
  if (status_after) updates.status = status_after;
  
  if (event_type === "triage" && payload) {
    if (payload.severity) updates.severity = payload.severity;
    if (payload.type) updates.type = payload.type;
    if (payload.confidence !== undefined) updates.confidence = payload.confidence;
  }
  if (event_type === "plan_generado" && payload) {
    if (payload.runbook_id) updates.runbook_id = payload.runbook_id;
  }

  if (Object.keys(updates).length > 0) {
    store.updateIncident(incident_id, updates);
  }

  const event = store.addEvent(incident_id, req.body);
  res.json({ event_id: event.id, logged: true });
});

app.post("/tools/close/:id", (req, res) => {
  const inc = store.updateIncident(req.params.id, {
    status: req.body.final_status,
    resolved_at: new Date().toISOString()
  });
  res.json(inc);
});

// Ruta comodín para que cualquier ruta sirva el index.html del frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});
