# Zoho to Google Workspace Mailbox Migration Platform (Z2G)

A high-performance, enterprise-grade mailbox migration platform designed to transfer mailboxes from Zoho Mail (IMAP) to Google Workspace (Gmail API) with strict deduplication, bounded concurrency, real-time telemetry, and resilient self-remediation.

## Key Capabilities

- **Zero-Duplicate Guarantee**: Computes RFC822 SHA-256 hashes for every message and maintains a transactional SQLite `message_ledger` table with unique hash indexing. Safe against multiple job runs, re-tries, and interruptions.
- **Bulk Migration Engine**: Controlled concurrency queue (2–4 workers) designed to pump multi-hundred mailbox migrations without exhausting IMAP sockets or hitting Google API quotas.
- **Process Crash Recovery**: Automatically reconciles SQLite job state with in-memory worker threads upon process reboot.
- **Automated Preflight & Baseline Discovery**: Validates Zoho IMAP credentials and Google Service Account domain-wide delegation, computes baseline message counts, and auto-locks baselines.
- **Self-Remediation Engine**: Diagnoses IMAP port/host discrepancies, 2FA/app password issues, and offers automated switch actions.
- **Live Worker Telemetry**: Real-time per-worker streaming cards displaying current folder, active IMAP UID, subject snippet, and progress bars.
- **Cryptographic Credential Purge**: Complete post-migration wipe of source credentials while preserving immutable audit logs and reconciliation reports.

## Tech Stack

- **Framework**: Next.js 15 (App Router, React 19, Tailwind CSS)
- **Database**: SQLite (`better-sqlite3`) with WAL mode
- **Protocols**: IMAP (`imapflow`) & Google Workspace API (`google-auth-library` with domain-wide delegation)
- **Testing**: Vitest with unit and acceptance test suites

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env.local` and add your Google Cloud service account JSON:
```bash
cp .env.example .env.local
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the migration dashboard.

### 4. Run Test Suite
```bash
npm test
```

## Security & Compliance
- Source passwords and credentials are cryptographically protected in SQLite and never logged in plain text.
- Post-migration compliance includes cryptographic credential destruction adhering to data governance standards.
