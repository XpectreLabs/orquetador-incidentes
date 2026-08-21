// Store en memoria — se pierde al reiniciar el server, y está bien para la demo.
// Persona C: si sobra tiempo, esto se puede migrar a SQLite sin tocar server.js
// porque las funciones de abajo son el único punto de acceso a los datos.

export const incidents = new Map();   // id -> incident object
export const events = new Map();      // incident_id -> [event, event, ...]

export function createIncident(incident) {
  incidents.set(incident.id, incident);
  events.set(incident.id, []);
  return incident;
}

export function getIncident(id) {
  return incidents.get(id) || null;
}

const SEVERITY_ORDER = { SEV1: 0, SEV2: 1, SEV3: 2, SEV4: 3, null: 4 };

export function listIncidents(filters = {}) {
  let list = Array.from(incidents.values());
  if (filters.status) list = list.filter(i => i.status === filters.status);
  if (filters.severity) list = list.filter(i => i.severity === filters.severity);
  // Priorización automática: más severo primero, luego más reciente primero
  list.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  return list;
}

export function updateIncident(id, patch) {
  const current = incidents.get(id);
  if (!current) return null;
  const updated = { ...current, ...patch, updated_at: new Date().toISOString() };
  incidents.set(id, updated);
  return updated;
}

export function addEvent(incidentId, event) {
  const list = events.get(incidentId) || [];
  const fullEvent = {
    id: `evt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    ...event
  };
  list.push(fullEvent);
  events.set(incidentId, list);
  return fullEvent;
}

export function getEvents(incidentId) {
  return events.get(incidentId) || [];
}
