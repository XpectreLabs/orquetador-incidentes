const API_BASE = "http://localhost:3000"; // Persona A: mover a config si da tiempo

let selectedIncidentId = null;

async function loadQueue() {
  const res = await fetch(`${API_BASE}/api/incidents`);
  const { incidents } = await res.json();
  const container = document.getElementById("queue-list");
  container.innerHTML = "";
  incidents.forEach(inc => {
    const div = document.createElement("div");
    div.className = `incident-card sev-${inc.severity || "SEV4"}`;
    div.innerHTML = `
      <strong>${inc.title}</strong><br>
      <small>${inc.status} · ${inc.severity || "sin clasificar"} · ${inc.service_affected}</small>
    `;
    div.onclick = () => selectIncident(inc.id);
    container.appendChild(div);
  });
}

async function selectIncident(id) {
  selectedIncidentId = id;
  await loadDetail(id);
}

async function loadDetail(id) {
  const [incRes, evRes] = await Promise.all([
    fetch(`${API_BASE}/api/incidents/${id}`),
    fetch(`${API_BASE}/api/incidents/${id}/events`)
  ]);
  const inc = await incRes.json();
  const { events } = await evRes.json();

  document.getElementById("incident-detail").innerHTML = `
    <h3>${inc.title}</h3>
    <p>${inc.description}</p>
    <p><strong>Estado:</strong> ${inc.status} |
       <strong>Severidad:</strong> ${inc.severity || "-"} |
       <strong>Tipo:</strong> ${inc.type || "-"}</p>
  `;

  const timeline = document.getElementById("timeline");
  timeline.innerHTML = "<h4>Timeline</h4>";
  events.forEach(ev => {
    const div = document.createElement("div");
    div.className = `event-item event-actor-${ev.actor}`;
    div.innerHTML = `
      <strong>${ev.event_type}</strong> — ${ev.actor}
      <br><small>${new Date(ev.timestamp).toLocaleTimeString()}</small>
      <br><small>${JSON.stringify(ev.payload || {})}</small>
    `;
    timeline.appendChild(div);
  });

  const approvalPanel = document.getElementById("approval-panel");
  approvalPanel.style.display = inc.status === "pendiente_aprobacion" ? "block" : "none";
}

document.getElementById("approve-btn").onclick = async () => {
  await fetch(`${API_BASE}/api/incidents/${selectedIncidentId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved_by: "juez_demo" })
  });
  loadDetail(selectedIncidentId);
};

document.getElementById("reject-btn").onclick = async () => {
  await fetch(`${API_BASE}/api/incidents/${selectedIncidentId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rejected_by: "juez_demo" })
  });
  loadDetail(selectedIncidentId);
};

// Polling simple cada 3s para que se vea "en vivo"
setInterval(() => {
  loadQueue();
  if (selectedIncidentId) loadDetail(selectedIncidentId);
}, 3000);

loadQueue();
