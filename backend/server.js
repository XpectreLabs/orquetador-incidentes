import express from "express";
import cors from "cors";
import "dotenv/config";
import fs from "fs";

import * as store from "./store.js";
import * as sim from "./simulators.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// --- Cargar seed data al arrancar ---
const seed = JSON.parse(fs.readFileSync("./seed-incidents.json", "utf-8"));
seed.forEach(inc => store.createIncident({
  ...inc,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}));

const runbooks = JSON.parse(fs.readFileSync("./runbooks.json", "utf-8"));

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

app.post("/api/incidents/:id/approve", (req, res) => {
  const inc = store.updateIncident(req.params.id, { status: "ejecutando" });
  store.addEvent(req.params.id, {
    actor: "humano",
    event_type: "aprobacion_otorgada",
    payload: { approved_by: req.body.approved_by || "demo_user" },
    status_before: "pendiente_aprobacion",
    status_after: "ejecutando",
    success: true
  });
  res.json(inc);
});

app.post("/api/incidents/:id/reject", (req, res) => {
  const inc = store.updateIncident(req.params.id, { status: "escalado" });
  store.addEvent(req.params.id, {
    actor: "humano",
    event_type: "aprobacion_rechazada",
    payload: { rejected_by: req.body.rejected_by || "demo_user" },
    status_before: "pendiente_aprobacion",
    status_after: "escalado",
    success: false
  });
  res.json(inc);
});

app.get("/api/runbooks", (req, res) => {
  res.json({ runbooks });
});

// ---------- ENDPOINTS QUE USA EL AGENTE (tools reales) ----------
// El agente llama estos endpoints en vez de tocar simulators.js directamente,
// así el backend siempre controla qué se ejecuta (ver punto de seguridad del diseño).

app.get("/tools/context/:id", (req, res) => {
  const inc = store.getIncident(req.params.id);
  if (!inc) return res.status(404).json({ error: "no encontrado" });
  res.json({ ...inc, previous_events: store.getEvents(req.params.id) });
});

app.get("/tools/runbooks", (req, res) => {
  const { type, severity } = req.query;
  let list = runbooks;
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
  // Seguridad: rollback SIEMPRE requiere que el incidente ya esté aprobado
  if (inc && inc.status !== "ejecutando") {
    return res.status(403).json({ error: "acción requiere aprobación previa" });
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
  const event = store.addEvent(req.body.incident_id, req.body);
  res.json({ event_id: event.id, logged: true });
});

app.post("/tools/close/:id", (req, res) => {
  const inc = store.updateIncident(req.params.id, {
    status: req.body.final_status,
    resolved_at: new Date().toISOString()
  });
  res.json(inc);
});

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});
