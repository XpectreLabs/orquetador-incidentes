# ANCLA SISTEMAS — Orquestador de Incidentes (100% simulado)

Proyecto de hackathon. Sin base de datos, sin sistemas reales — todo en memoria y simulado
a propósito para poder terminar en 2 horas.

## Estructura

```
ancla-sistemas/
├── backend/          # Persona C — API + store en memoria + simuladores
│   ├── server.js
│   ├── store.js
│   ├── simulators.js
│   ├── runbooks.json
│   ├── seed-incidents.json
│   └── package.json
├── agent/             # Tú — lógica de Claude (triage, plan, ejecución)
│   ├── agent.js
│   ├── prompts.js
│   └── tools-schema.js
├── frontend/          # Persona A — HTML/CSS/JS plano, sin build
│   ├── index.html
│   ├── app.js
│   └── style.css
├── .env.example
└── README.md
```

## Plan de 2 horas (bloques de trabajo en paralelo)

| Tiempo | Persona A (frontend) | Tú (agente) | Persona C (backend) |
|---|---|---|---|
| 0:00-0:15 | Setup, revisar `index.html` base | Configurar API key, probar 1 llamada simple | `npm install`, correr `server.js`, confirmar que responde |
| 0:15-0:50 | Cola + timeline contra datos mock ya incluidos en `app.js` | Implementar `triage()` y `planRunbook()` en `agent.js` | Implementar endpoints reales sobre `store.js` |
| 0:50-1:20 | Conectar a API real (cambiar mocks por `fetch`) | Implementar loop de ejecución de tools + `log_action` | Implementar `simulators.js` (restart/rollback con éxito/fallo) |
| 1:20-1:45 | Panel de aprobación funcional | Probar los 3 tickets seed end-to-end | Endpoint `/approve` y `/reject` funcionando |
| 1:45-2:00 | Pulido visual mínimo | Ajustar prompts si algo falla | Revisar logs, asegurar que timeline no rompe |

## Cómo correr (backend)

```bash
cd backend
npm install
node server.js
# corre en http://localhost:3000
```

## Cómo correr (frontend)

Abrir `frontend/index.html` directo en el navegador (usa `fetch` a `http://localhost:3000`,
no necesita build ni servidor).

## Variables de entorno

Copiar `.env.example` a `.env` dentro de `backend/` y `agent/` y completar con la API key real.
