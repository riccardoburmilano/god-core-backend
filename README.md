# GOD Core v2.0 — Backend Runtime

> General Operative Director — Node.js + Express
> Deploy su Railway o Render in 10 minuti.

## Stack
- Node.js 18+
- Express 4
- Anthropic SDK (claude-sonnet-4-20250514)
- node-cron (VALUE_DAEMON)

## Struttura

```
god-backend/
├── src/
│   ├── index.js              # Entry point + server boot
│   ├── modules/
│   │   ├── state.js          # GOD.STATE — shared memory
│   │   ├── router.js         # Intent classification + auto-pipeline
│   │   ├── pipeline.js       # Anthropic API calls per skill
│   │   └── scoring.js        # 4-axis scoring engine
│   ├── daemon/
│   │   └── valueDaemon.js    # VALUE_DAEMON — 10 regole autonome
│   └── routes/
│       └── api.js            # Tutti gli endpoint REST
├── railway.json              # Config Railway
├── render.yaml               # Config Render
├── .env.example              # Template variabili ambiente
└── package.json
```

## Deploy su Railway (5 minuti)

1. Vai su [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Seleziona questo repo
4. Add Variables:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   GOD_MODEL=claude-sonnet-4-20250514
   NODE_ENV=production
   ```
5. Railway detecta `railway.json` e deploya automaticamente

## Deploy su Render (alternativa gratuita)

1. Vai su [render.com](https://render.com)
2. New → Web Service → Connect GitHub
3. Seleziona questo repo
4. Render usa `render.yaml` automaticamente
5. Aggiungi `ANTHROPIC_API_KEY` nelle Environment Variables

## API Endpoints

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/api/v2/health` | Status sistema |
| GET | `/api/v2/state` | GOD.STATE completo |
| GET | `/api/v2/tasks` | Lista task |
| POST | `/api/v2/tasks` | Crea task |
| POST | `/api/v2/tasks/:id/run` | Esegui task (chiama Anthropic) |
| GET | `/api/v2/scores` | Storico scoring |
| GET | `/api/v2/credits` | Saldo crediti |
| POST | `/api/v2/credits/topup` | Ricarica crediti |
| GET | `/api/v2/diagnoses` | Diagnosi errori |
| GET | `/api/v2/memory` | Pattern memoria |
| GET | `/api/v2/verdicts` | Verdetti Guardiano |
| POST | `/api/v2/pipeline/auto` | Auto-pipeline da testo |
| GET | `/api/v2/daemon/status` | Status VALUE_DAEMON |
| POST | `/api/v2/daemon/start` | Avvia daemon |
| POST | `/api/v2/daemon/stop` | Ferma daemon |
| POST | `/api/v2/system/mode` | Cambia modalità sistema |

## Esempio: creare ed eseguire un task

```bash
# 1. Crea task
curl -X POST https://tuodominio.railway.app/api/v2/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Scrivi un articolo su AI e PMI italiane"}'

# 2. Esegui task (risposta con output Anthropic reale)
curl -X POST https://tuodominio.railway.app/api/v2/tasks/god-XXXXX/run

# 3. Auto-pipeline
curl -X POST https://tuodominio.railway.app/api/v2/pipeline/auto \
  -H "Content-Type: application/json" \
  -d '{"description": "Crea contenuto per il lancio di Mercantis"}'
```

## VALUE_DAEMON

Il daemon parte automaticamente al boot se `ANTHROPIC_API_KEY` è configurata.
Si auto-avvia ogni 15 secondi e applica 10 regole:
- R01: Auto-repair moduli degradati
- R02: SAFE MODE se budget basso
- R03: DIAGNOSTIC MODE se score in calo
- R04: RECOVERY MODE se errori spike
- R05: Purge memoria se troppi record
- R06: Idle healing
- R07: Pattern escalation
- R08: Budget restore se a zero
- R09: Ritorno a NORMAL quando score si riprende
- R10: Heartbeat

## Roadmap verso Black Death

- [x] v2.0 — Backend reale con Anthropic API
- [ ] v2.1 — Webhook in/out (Make, Zapier, n8n)
- [ ] v2.5 — Multi-task parallel execution
- [ ] v3.0 — Multi-agent: istanze GOD multiple
- [ ] v3.5 — CyberEarn: GOD genera revenue autonomamente
- [ ] v4.0 — GOD si replica e si difende
