const API_BASE = "http://localhost:3000";

let selectedIncidentId = null;
let currentFilter = "all";
let incidentsCache = [];

// Clock
function updateClock() {
  const clockEl = document.getElementById("clock");
  if (!clockEl) return;
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString("es-MX", { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// Toast notification
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 3500);
}

// Reset Demo button
const resetBtn = document.getElementById("btn-reset-demo");
if (resetBtn) {
  resetBtn.addEventListener("click", async () => {
    try {
      await fetch(`${API_BASE}/api/reset`, { method: "POST" });
      showToast("↺ Datos de demo restaurados");
      selectedIncidentId = null;
      document.getElementById("empty-state").style.display = "flex";
      document.getElementById("detail-content").style.display = "none";
      await loadQueue();
    } catch (err) {
      showToast("✕ Error al reiniciar datos");
    }
  });
}

// Filter buttons
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderQueue(incidentsCache);
  });
});

// Load Queue from Backend
async function loadQueue() {
  try {
    const res = await fetch(`${API_BASE}/api/incidents`);
    if (!res.ok) throw new Error("Error al conectar con la API");
    const data = await res.json();
    incidentsCache = data.incidents || [];
    
    const statusInd = document.getElementById("server-status");
    if (statusInd) statusInd.style.display = "flex";
    
    renderQueue(incidentsCache);
    
    // Update badge count
    const countBadge = document.getElementById("incident-count");
    if (countBadge) countBadge.textContent = incidentsCache.length;
  } catch (err) {
    console.error("Error al cargar cola:", err);
  }
}

// Render queue list with filters
function renderQueue(incidents) {
  const container = document.getElementById("queue-list");
  if (!container) return;
  
  let filtered = incidents;
  if (currentFilter !== "all") {
    filtered = incidents.filter(inc => inc.status === currentFilter);
  }

  container.innerHTML = "";
  
  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 2.5rem 1rem; color: var(--text-muted); font-size: 0.85rem;">No hay incidentes en este filtro</div>`;
    return;
  }

  filtered.forEach(inc => {
    const card = document.createElement("div");
    const sev = inc.severity || "SEV4";
    const isActive = inc.id === selectedIncidentId ? "active" : "";
    card.className = `incident-card sev-${sev} ${isActive}`;
    card.id = `card-${inc.id}`;

    const sevBadge = inc.severity ? `<span class="chip sev-chip ${inc.severity}">${inc.severity}</span>` : "";

    card.innerHTML = `
      <div class="card-title">${inc.title}</div>
      <div class="card-meta">
        <span class="chip chip-status-${inc.status}">${inc.status.replace(/_/g, " ")}</span>
        <span class="chip chip-service">${inc.service_affected}</span>
        ${sevBadge}
      </div>
    `;

    card.onclick = () => selectIncident(inc.id);
    container.appendChild(card);
  });
}

// Select an incident
async function selectIncident(id) {
  selectedIncidentId = id;
  
  // Highlight active card
  document.querySelectorAll(".incident-card").forEach(c => c.classList.remove("active"));
  const activeCard = document.getElementById(`card-${id}`);
  if (activeCard) activeCard.classList.add("active");

  await loadDetail(id);
}

// Load detail & timeline
async function loadDetail(id) {
  try {
    const [incRes, evRes] = await Promise.all([
      fetch(`${API_BASE}/api/incidents/${id}`),
      fetch(`${API_BASE}/api/incidents/${id}/events`)
    ]);

    if (!incRes.ok) return;

    const inc = await incRes.json();
    const { events } = await evRes.json();

    // Show detail content, hide empty state
    const emptyState = document.getElementById("empty-state");
    const detailContent = document.getElementById("detail-content");
    if (emptyState) emptyState.style.display = "none";
    if (detailContent) detailContent.style.display = "flex";

    // Populate header
    document.getElementById("detail-title").textContent = inc.title;
    document.getElementById("detail-desc").textContent = inc.description;
    document.getElementById("detail-service").textContent = inc.service_affected;
    
    // Chips
    const sevEl = document.getElementById("detail-sev");
    sevEl.textContent = inc.severity || "Sin clasificar";
    sevEl.className = `sev-chip ${inc.severity || ""}`;

    const typeEl = document.getElementById("detail-type");
    typeEl.textContent = inc.type ? `Tipo: ${inc.type}` : "Tipo: —";

    const statusEl = document.getElementById("detail-status");
    statusEl.textContent = inc.status.replace(/_/g, " ");
    statusEl.className = `chip-status-${inc.status} chip`;

    // Confidence Bar (from triage event)
    const triageEvent = events.find(e => e.event_type === "triage");
    const confidenceRow = document.getElementById("confidence-row");
    if (triageEvent && triageEvent.payload && triageEvent.payload.confidence !== undefined) {
      confidenceRow.style.display = "flex";
      const pct = Math.round(triageEvent.payload.confidence * 100);
      document.getElementById("confidence-fill").style.width = `${pct}%`;
      document.getElementById("confidence-val").textContent = `${pct}% certeza`;
    } else {
      confidenceRow.style.display = "none";
    }

    // Approval Panel
    const approvalPanel = document.getElementById("approval-panel");
    approvalPanel.style.display = inc.status === "pendiente_aprobacion" ? "flex" : "none";

    // Render Timeline
    renderTimeline(events);

  } catch (err) {
    console.error("Error al cargar detalle:", err);
  }
}

// Render Timeline events
function renderTimeline(events) {
  const timelineEl = document.getElementById("timeline");
  const emptyEl = document.getElementById("timeline-empty");
  const countBadge = document.getElementById("event-count");
  
  if (!timelineEl) return;

  if (countBadge) countBadge.textContent = events.length;

  if (events.length === 0) {
    timelineEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";
  timelineEl.innerHTML = "";

  events.forEach(ev => {
    const item = document.createElement("div");
    item.className = `timeline-item timeline-actor-${ev.actor}`;

    let payloadFormatted = "";
    if (ev.payload) {
      if (typeof ev.payload === "string") {
        payloadFormatted = `<div class="timeline-body">${ev.payload}</div>`;
      } else if (ev.event_type === "triage") {
        payloadFormatted = `
          <div class="timeline-body">
            <strong>Severidad:</strong> <span class="mono">${ev.payload.severity || "—"}</span> | <strong>Tipo:</strong> <span class="mono">${ev.payload.type || "—"}</span><br>
            <em style="color: var(--text-secondary); margin-top: 4px; display: inline-block;">"${ev.payload.justification || ""}"</em>
          </div>
        `;
      } else if (ev.event_type === "plan_generado") {
        payloadFormatted = `
          <div class="timeline-body">
            <strong>Runbook:</strong> <code class="mono">${ev.payload.runbook_id || "Ninguno"}</code><br>
            <em style="color: var(--text-secondary); margin-top: 4px; display: inline-block;">${ev.payload.reasoning || ""}</em>
          </div>
        `;
      } else if (ev.event_type === "tool_result") {
        payloadFormatted = `
          <div class="timeline-body">
            <strong>Herramienta:</strong> <code class="mono">${ev.tool_name || "acción"}</code><br>
            <pre class="json-viewer">${JSON.stringify(ev.payload, null, 2)}</pre>
          </div>
        `;
      } else {
        payloadFormatted = `
          <div class="timeline-body">
            <pre class="json-viewer">${JSON.stringify(ev.payload, null, 2)}</pre>
          </div>
        `;
      }
    }

    const timeStr = new Date(ev.timestamp).toLocaleTimeString("es-MX", { hour12: false });

    item.innerHTML = `
      <div class="timeline-node"></div>
      <div class="timeline-card">
        <div class="timeline-top">
          <span class="timeline-event-name">${ev.event_type.replace(/_/g, " ")}</span>
          <span class="timeline-time">${timeStr}</span>
        </div>
        <span class="timeline-actor-tag">${ev.actor.toUpperCase()}</span>
        ${payloadFormatted}
      </div>
    `;

    timelineEl.appendChild(item);
  });
}

// Approve / Reject actions
document.getElementById("approve-btn").onclick = async () => {
  if (!selectedIncidentId) return;
  try {
    await fetch(`${API_BASE}/api/incidents/${selectedIncidentId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved_by: "Operador SRE (Demo)" })
    });
    showToast("✓ Autorización otorgada por el operador");
    await loadDetail(selectedIncidentId);
    await loadQueue();
  } catch (err) {
    showToast("✕ Error al aprobar acción");
  }
};

document.getElementById("reject-btn").onclick = async () => {
  if (!selectedIncidentId) return;
  try {
    await fetch(`${API_BASE}/api/incidents/${selectedIncidentId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejected_by: "Operador SRE (Demo)" })
    });
    showToast("✕ Acción rechazada. Incidente escalado");
    await loadDetail(selectedIncidentId);
    await loadQueue();
  } catch (err) {
    showToast("✕ Error al rechazar acción");
  }
};

// Polling interval (every 2.5s)
setInterval(() => {
  loadQueue();
  if (selectedIncidentId) {
    loadDetail(selectedIncidentId);
  }
}, 2500);

// Initial Load
loadQueue();
