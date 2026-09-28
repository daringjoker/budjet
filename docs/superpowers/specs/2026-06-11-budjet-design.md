# Budjet — Design Spec
_Date: 2026-06-11_

## Overview

A personal financial management application that automatically ingests bank transaction emails via IMAP IDLE, parses them using a local LLM (node-llama-cpp), stores them in SQLite via Drizzle ORM, and exposes them through a tRPC API consumed by both a React web dashboard and a CLI.

---

## Architecture

### Approach
Single Node.js process with worker threads (Option B). The main thread handles IMAP IDLE and email queuing; 1–2 worker threads run the LLM pipeline. A tRPC HTTP server runs alongside the ingestion pipeline in the same process.

### Monorepo Structure (pnpm workspaces + Turborepo)

```
budjet/
├── packages/
│   ├── backend/     # IMAP watcher, LLM worker, tRPC server, Drizzle/SQLite
│   ├── frontend/    # React + Vite dashboard
│   ├── cli/         # tRPC client wrapped as CLI (commander.js)
│   └── shared/      # Drizzle schema, shared TS types, tRPC router types
├── pnpm-workspace.yaml
├── turbo.json
├── config.json      # bank senders, LLM config (committed, no secrets)
└── .env             # IMAP credentials (not committed)
```

### Backend Modules

| Module | Responsibility |
|---|---|
| `imap-watcher` | IMAP IDLE connection, emits new email events, handles reconnect |
| `email-queue` | In-memory queue with backpressure between watcher and workers |
| `llm-worker` | Worker thread running node-llama-cpp; classify + parse jobs |
| `db` | Drizzle schema + query helpers; all DB access goes through here |
| `config` | Loads and validates `config.json` + `.env` |
| `trpc-server` | tRPC router, HTTP server (hono or express adapter) |
| `scheduler` | Nightly forecast job, recurring pattern detection |

---

## Data Model

### `accounts`
```
id              integer PK
name            text          -- "NMB Savings", "Wallet", "Nabil Debit"
type            text          -- "bank" | "cash" | "debit_card" | "credit_card" | "fund" | "investment"
bank_name       text          -- null for cash/fund accounts
email_sender    text          -- null for non-email accounts
currency        text          -- "NPR", "USD"
initial_balance real
created_at      integer
```

### `transactions`
```
id              integer PK
account_id      integer FK → accounts
date            integer       -- unix timestamp from email
amount          real          -- always positive
type            text          -- "debit" | "credit"
description     text
currency        text
balance_after   real          -- if present in email
source          text          -- "email" | "manual"
raw_email_id    integer FK → raw_emails (null if manual)
llm_confidence  real          -- null if manual entry
recurring_id    integer FK → recurring_transactions (null if one-off)
created_at      integer
```

### `raw_emails`
```
id              integer PK
message_id      text UNIQUE   -- IMAP message ID, prevents duplicates on restart
sender          text
subject         text
body_text       text
received_at     integer
status          text          -- "processed" | "unknown" | "failed"
account_id      integer FK → accounts (null if unknown sender)
```

### `categories`
```
id              integer PK
name            text          -- "Food", "Transport", "Utilities"
color           text          -- hex for UI
parent_id       integer FK → categories (subcategories)
```

### `transaction_categories` (many-to-many)
```
transaction_id  integer FK
category_id     integer FK
```

### `budgets`
```
id              integer PK
name            text
category_id     integer FK → categories
account_id      integer FK → accounts (null = all accounts)
amount          real          -- target spend limit
period          text          -- "monthly" | "weekly" | "yearly" | "custom"
start_date      integer
end_date        integer       -- null for recurring periods
created_at      integer
```

### `budget_alerts`
```
id              integer PK
budget_id       integer FK → budgets
threshold       real          -- e.g. 0.8 = alert at 80% spent
notified_at     integer       -- last time alert fired
```

### `recurring_transactions`
```
id                integer PK
account_id        integer FK → accounts
category_id       integer FK → categories
name              text          -- "Netflix", "Rent"
amount            real
currency          text
type              text          -- "debit" | "credit"
frequency         text          -- "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly"
start_date        integer
end_date          integer       -- null if ongoing
next_due_date     integer
last_matched_at   integer
auto_detected     integer       -- 1 = LLM detected, 0 = manual
tolerance_amount  real          -- acceptable amount variance
tolerance_days    integer       -- acceptable days early/late
status            text          -- "active" | "pending_confirmation" | "paused"
created_at        integer
```

### `predicted_transactions`
```
id                      integer PK
type                    text      -- "recurring" | "forecast" | "anticipated"
recurring_id            integer FK → recurring_transactions (null for forecast/anticipated)
account_id              integer FK → accounts
category_id             integer FK → categories
predicted_amount        real
predicted_date          integer
confidence              real      -- 0.0–1.0 (1.0 for anticipated)
basis                   text      -- "recurring_pattern" | "historical_average" | "trend" | null
status                  text      -- "pending" | "matched" | "missed"
matched_transaction_id  integer FK → transactions
notes                   text      -- user notes for anticipated entries
created_at              integer
```

---

## LLM Pipeline

### Flow

```
Email received
      │
      ▼
Gate 1: Sender allowlist check
      known bank → proceed
      unknown    → status: "unknown", skip LLM
      │
      ▼
Gate 2: LLM classification
      "transaction" → parse
      "other"       → status: "unknown"
      │
      ▼
LLM parse
      returns: { date, amount, type, description, currency, balance_after, confidence }
      │
      ▼
Confidence threshold check
      ≥ 0.85 → auto-insert transaction
      < 0.85 → insert with review flag, surface in UI
      │
      ▼
Post-insert: recurring detection
      query last 90 days for similar merchant + amount + interval
      if pattern found → propose recurring_transaction (user confirms)
```

### LLM Details
- **Library:** node-llama-cpp (runs in worker_thread)
- **Classify prompt:** short, returns `{type: "transaction"|"other", confidence: float}`
- **Parse prompt:** includes bank name as context, returns strict JSON schema
- **Grammar-constrained output:** enforced via node-llama-cpp's GBNF grammar — always valid JSON, no hallucinated fields
- **Confidence threshold:** configurable in `config.json`, default `0.85`

### Predicted Transaction Types

| type | created by | example |
|---|---|---|
| `recurring` | app, from recurring pattern | Netflix renews on 20th |
| `forecast` | app, from trend analysis | Projected food spend this month |
| `anticipated` | user, manually | Rent payment, medical bill |

---

## tRPC API

### Key Procedures

```
accounts.list / accounts.create / accounts.update
transactions.list(filters) / transactions.create / transactions.update
transactions.review(id, corrections)   -- fix low-confidence parses
budgets.list / budgets.create / budgets.progress
recurring.list / recurring.confirm / recurring.dismiss
predicted.list / predicted.createAnticipated
categories.list / categories.create
reports.summary(period) / reports.categoryBreakdown(period)
```

---

## CLI

**Package:** `packages/cli` using commander.js as a thin tRPC client.

```bash
budjet accounts list
budjet transactions list --account=NMB --month=june
budjet transactions add --manual
budjet review                        # list low-confidence parses to fix
budjet budgets create
budjet anticipate add --amount --date --note
budjet recurring list
budjet report --period=this-month
```

---

## Web UI

**Stack:** React + Vite, TypeScript, Recharts for charts, tRPC client.

### Screens

| Screen | Purpose |
|---|---|
| Dashboard | Monthly spend summary, budget progress bars, upcoming predicted/anticipated transactions |
| Transactions | Filterable table, inline category tagging, low-confidence review flags |
| Accounts | All accounts with current balance |
| Budgets | Create/edit budgets, actuals vs. targets, projected end-of-period spend |
| Recurring | Detected recurring payments, confirm/dismiss suggestions |
| Reports | Category breakdown charts, month-over-month trends |

---

## Configuration

### `config.json` (committed, no secrets)
```json
{
  "banks": [
    { "name": "NMB Bank", "sender": "alerts@nmb.com.np", "currency": "NPR" },
    { "name": "Nabil Bank", "sender": "noreply@nabilbank.com", "currency": "NPR" }
  ],
  "llm": {
    "modelPath": "./models/llama-3.2-3b.gguf",
    "confidenceThreshold": 0.85,
    "workerThreads": 1
  },
  "budget": {
    "forecastLookbackDays": 90
  }
}
```

### `.env` (not committed)
```
IMAP_HOST=imap.gmail.com
IMAP_USER=you@gmail.com
IMAP_PASSWORD=your-app-password
IMAP_PORT=993
```

---

## Error Handling & Resilience

- **IMAP disconnects:** exponential backoff reconnect with jitter; emails missed during downtime are caught by fetching unseen messages on reconnect
- **LLM failure:** email saved to `raw_emails` with `status: "failed"`; can be re-processed manually
- **Duplicate prevention:** `message_id UNIQUE` constraint — restarting the app never double-inserts
- **Low-confidence parses:** inserted but flagged; `budjet review` CLI command and Transactions UI surface them for correction
- **Budget alerts:** checked after every transaction insert; fires once per threshold crossing (`notified_at` prevents repeat alerts)
