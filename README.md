<div align="center">

# HarbourRWA

### *The First End-to-End Agentic Compliance & RWA Issuance Platform on Casper Network*

[![Casper Testnet](https://img.shields.io/badge/Casper-Testnet%20Deployed-00C2FF?style=for-the-badge)](https://testnet.cspr.live)
[![Track](https://img.shields.io/badge/Track-Casper%20Innovation-orange?style=for-the-badge)](https://dorahacks.io/hackathon/casper-agentic-buildathon)
[![Agentic AI](https://img.shields.io/badge/AI-4%20Agentic%20Systems-brightgreen?style=for-the-badge)](https://www.casper.network/ai)
[![RWA](https://img.shields.io/badge/Domain-Real--World%20Assets-purple?style=for-the-badge)]()
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)]()

**AI decides. Casper enforces. Humans stay in control.**

*From AI-drafted prospectus → regulated compliance scoring → on-chain oracle → regulator approval → identity-gated mint → coupon servicing → AI portfolio guidance — every step verifiable on Casper Testnet.*

</div>

---

## The Problem

The global Real-World Asset tokenization market is projected to reach **$16 trillion by 2030**. Yet nearly every existing "RWA platform" demo ends the same way: *"we deployed a token."*

That is not a product. It is a proof-of-concept masquerading as infrastructure. Real regulated issuance requires AI compliance analysis **bound to verifiable outputs**, regulatory approval that is **enforceable on-chain**, investor identity checks that **physically gate the mint**, and post-issuance coupon servicing that is **not just a promise**.

**HarbourRWA solves all of this — with every decision step anchored to Casper Testnet.**

---

## Live On-Chain Proof

Every claim below is verifiable on Casper Testnet right now.

| Component | Deploy Hash | Status | Explorer |
|---|---|---|---|
| TokenCoupon WASM (HIBT06181409) | `88f7511e752793b97716668e2e259fbc4378c58a6b2df961fbbfd9296025c5a5` | Success | [View](https://testnet.cspr.live/deploy/88f7511e752793b97716668e2e259fbc4378c58a6b2df961fbbfd9296025c5a5) |
| TokenCoupon WASM (HIBT20260618) | `694e152f22204abd19e9764edd0275261fcae410c547b189252a7f79e221b95e` | Submitted | [View](https://testnet.cspr.live/deploy/694e152f22204abd19e9764edd0275261fcae410c547b189252a7f79e221b95e) |
| TokenCoupon WASM (HIBT06171423) | `13061ac9dd94db1300b8367fe5efa114bbe62f2e22306cadde73b6c5bdf0acd9` | Submitted | [View](https://testnet.cspr.live/deploy/13061ac9dd94db1300b8367fe5efa114bbe62f2e22306cadde73b6c5bdf0acd9) |
| Investor CSPR Payment | `66fea6812a30b170ac954a6de587e6ce89bd9a0a1dd42a5a16d77c3ba5a3048e` | Success | [View](https://testnet.cspr.live/deploy/66fea6812a30b170ac954a6de587e6ce89bd9a0a1dd42a5a16d77c3ba5a3048e) |

**Resolved Contract Hash (HIBT06181409):**
```
contract-255e2c83505b095d9eadb285282016d2bedfe926b93c721dadd3fc66f9be2ee7
```

---

## What HarbourRWA Does

A full-lifecycle, human-in-the-loop RWA issuance and servicing platform where AI agents accelerate regulated decisions and Casper Network makes those decisions enforceable. The pipeline covers 8 stages from first document to investor coupon claim.

| # | Stage | Actor | What Happens | On-Chain? |
|:---:|:---:|:---:|---|:---:|
| 1 | **Draft** | AI | Generates SFC-compliant prospectus and term sheet from issuer inputs | — |
| 2 | **Review** | AI | Scores submission against 20 SFC rules; produces SHA-256 hash-bound compliance report | — |
| 3 | **Oracle** | AI | Posts `(score, report_hash)` to `ComplianceOracle` contract on Casper | Yes |
| 4 | **Approval** | Regulator | Reviews AI report; triggers on-chain approval flag — physically gates the mint | Yes |
| 5 | **KYC** | KYC Admin | AI pre-screens investor; admin grants eligibility written to `IdentityRegistry` | Yes |
| 6 | **Mint** | Investor | Mint attempted — contract enforces `score >= threshold AND approved AND kyc_eligible`, rejects otherwise | Yes |
| 7 | **Coupon** | Issuer | On-chain coupon funding; investors claim directly from `TokenCoupon` contract | Yes |
| 8 | **Advise** | AI | Portfolio advisor reads live on-chain state; explains coupon schedule and guides allocation | Yes |

---

## The Core Innovation

> **AI creates structured, hash-bound decision signals. Casper turns those signals into contract-enforced state that cannot be bypassed.**

This is not a chatbot with a "deploy" button. It is a deterministic pipeline where the AI compliance report is on-chain — or the token does not exist.

```
AI Compliance Report  (OpenAI-compatible LLM)
         |
         v
   SHA-256 Hash of full report text
         |
         v
  submit_score(asset_id, score=85, report_hash=0xabc...)
         |
         v
  ComplianceOracle  <-- immutable, public, verifiable on Casper Testnet
         |
         v
  TokenCoupon::mint_to() reads oracle state
         |
    score < 70    --> TRANSACTION REJECTED (contract revert)
    approved = false --> TRANSACTION REJECTED (contract revert)
    kyc = false   --> TRANSACTION REJECTED (contract revert)
         |
    All checks pass --> MINT SUCCEEDS --> investor balance updated
```

The human roles — compliance officer, regulator, KYC admin — remain in the loop at every gate. AI accelerates their work; the contract enforces the outcome.

---

## Why Casper Network

HarbourRWA is built Casper-first for reasons that matter specifically in regulated finance.

| Casper Feature | Why It Matters for RWA |
|---|---|
| **Upgradeable Contracts** | Compliance rules evolve; contracts can be updated without redeploying assets |
| **Account Model with Permissions** | Multi-sig regulator approval maps naturally to Casper's native account permission model |
| **Deterministic Gas Costs** | Institutions require predictable transaction costs for compliance workflows |
| **Rust / WASM Contracts** | Type safety and formal verifiability are critical for financial infrastructure |
| **Casper AI Toolkit** | Odra framework and MCP servers designed for agentic workflows (roadmap integration below) |

---

## AI Agents — Four Systems, Each with On-Chain Consequences

| Agent | Trigger | What the AI Does | On-Chain Outcome |
|---|---|---|---|
| **Prospectus Drafter** | Issuer submits asset details | Generates SFC-compliant offering memorandum, term sheet, and risk disclosures from free-form text | SFC reference ID recorded at registration |
| **Compliance Scorer** | Sponsor submits document | Scores against 20 SFC rules per asset type; produces structured JSON report with per-rule pass/fail and rationale | `submit_score(asset_id, score, report_hash)` to `ComplianceOracle` on Casper |
| **KYC Assessor** | Investor submits documents | Pre-screens jurisdiction, AML flags, and document consistency; produces AI summary and recommendation | KYC admin approval triggers `upsert_investor()` to `IdentityRegistry` on Casper |
| **Portfolio Advisor** | Investor opens portfolio | Reads live contract state (balance, coupon schedule, funded periods, claimed status); explains allocation and timing | Read-only; surfaces `get_coupon()` and `balance_of()` state from `TokenCoupon` |

---

## Smart Contracts

All three primary contracts are written in **Rust using the Odra Framework**, compiled to WASM, and deployed to Casper Testnet.

### ComplianceOracle

The single source of truth for mint gating. No off-chain bypass is possible.

| Entry Point | Parameters | Effect |
|---|---|---|
| `submit_score` | `asset_id: String, score: u8, report_hash: Vec<u8>` | Writes compliance score and report hash for the given asset |
| `get_score` | `asset_id: String` | Returns `(score: u8, report_hash, timestamp)` |
| `is_compliant` | `asset_id: String, threshold: u8` | Returns `bool` — used by mint logic |
| `transfer_ownership` | `new_owner: Key` | Transfers oracle ownership |

### IdentityRegistry

Stores investor KYC status. Queried at mint and transfer.

| Entry Point | Parameters | Effect |
|---|---|---|
| `upsert_investor` | `investor: Key, is_verified: bool, aml_clear: bool, jurisdiction: String, kyc_expiry: u64` | Creates or updates investor eligibility record |
| `revoke_investor` | `investor: Key` | Immediately revokes investor eligibility |
| `get_investor` | `investor: Key` | Returns full investor record |
| `is_eligible` | `investor: Key` | Returns `bool` — used by mint logic |
| `transfer_officer` | `new_officer: Key` | Changes compliance officer authority |

### TokenCoupon

Token issuance, subscription, coupon scheduling, and claims.

| Entry Point | Parameters | Effect |
|---|---|---|
| `init` | `asset_id, asset_name, symbol, issuer, total_issuance, currency, compliance_oracle_hash, identity_registry_hash, sfcRef` | Initialises contract state |
| `mint_to` | `to: Key, amount: u64, payment_ref: String` | Mints tokens to investor (enforces oracle + registry checks) |
| `subscribe` | `investor: Key, amount: u64, payment_ref: String` | Records pending subscription |
| `settle_purchase` | `investor: Key, amount: u64, payment_ref: String` | Confirms settlement and credits balance |
| `record_coupon` | `payment_date: u64, amount_per_token: u64, currency: String` | Schedules a coupon payment |
| `get_metadata` | — | Returns asset metadata |
| `get_coupon` | `payment_date: u64` | Returns coupon record |
| `get_subscription` | `payment_ref: String` | Returns subscription status |
| `balance_of` | `investor: Key` | Returns investor token balance |
| `total_minted` | — | Returns total tokens minted |
| `set_mint_authority` | `new_authority: Key` | Updates mint authority |

---

## Compliance Engine — 20 SFC Rules

Rules are defined in `compliance-rules/sfc-rules.json` and evaluated per asset type. Each rule produces a pass/fail signal and a natural-language rationale included in the hash-bound report.

**Core Rules (all asset types)**

| ID | Rule | Weight |
|---|---|---|
| SFC-001 | Issuer Eligibility | 20 |
| SFC-002 | Investor Restriction / Professional Investor | 20 |
| SFC-003 | Asset Backing | 15 |
| SFC-004 | Custody | 15 |
| SFC-005 | Disclosure | 10 |
| SFC-006 | AML / KYC | 10 |
| SFC-007 | Technology Risk / Smart Contract Audit | 5 |
| SFC-008 | Transferability / On-Chain Enforcement | 5 |

**Bond-Specific Rules**

| ID | Rule | Weight |
|---|---|---|
| BOND-001 | Bond Prospectus Disclosure | 20 |
| BOND-002 | Credit Rating | 15 |
| BOND-003 | Trustee & Paying Agent | 15 |
| BOND-004 | Negative Pledge & Covenants | 10 |
| BOND-005 | SFC Debt Securities Code | 10 |

Trade Receivable (5 rules), Green Bond (1), and REIT (1) rules are evaluated when the asset type matches. Total: 5 distinct asset type configurations, extensible to MAS (Singapore), DFSA (Dubai), and SEC rule sets.

---

## Application Routes

| Route | Role | AI Agent | On-Chain Contract |
|---|---|---|---|
| `/prospectus` | Issuer | Prospectus Drafter | — |
| `/tokenize` | Issuer | — | Casper TokenCoupon WASM deploy |
| `/compliance` | Sponsor | Compliance Scorer | `ComplianceOracle::submit_score()` |
| `/audit` | Sponsor / Regulator | Contract reviewer | — |
| `/regulator` | Regulator | — | `ComplianceOracle` approval flag |
| `/kyc` | Investor | KYC Assessor (pre-screen) | — |
| `/admin/kyc` | KYC Admin | — | `IdentityRegistry::upsert_investor()` |
| `/subscribe` | Investor | — | `TokenCoupon::mint_to()` (gated) |
| `/portfolio` | Investor | Portfolio Advisor | `TokenCoupon::get_coupon()`, `balance_of()` |

---

## HIBT — Live Demonstration Asset

**Harbour Infrastructure Bond Token (HIBT)** is the live demonstration asset deployed throughout this buildathon. It is modelled on a real SFC-authorised Hong Kong corporate bond to show that every platform feature maps to actual regulatory and financial requirements.

| Property | Value |
|---|---|
| **Full Name** | Harbour Infrastructure Bond Token |
| **Ticker** | HIBT |
| **Issuer** | Harbour Capital Markets Corporation Limited |
| **SFC Authorisation Ref** | SFC/HIBT/2026-B/001 |
| **SFC Licence** | Type 1 (Dealing in Securities) & Type 6 (Advising on Corporate Finance) |
| **Asset Type** | Corporate Bond |
| **Credit Rating** | Moody's A2 / S&P A (Stable Outlook) |
| **Face Value** | USD 1,000 per token |
| **Total Issuance** | USD 100,000,000 (100,000 tokens) |
| **Coupon Rate** | 5.50% per annum |
| **Coupon Frequency** | Semi-annual (15 January & 15 July each year) |
| **First Coupon** | 15 January 2027 |
| **Maturity Date** | 15 July 2031 (5-year tenor) |
| **Minimum Subscription** | USD 200,000 (200 tokens) |
| **Settlement** | T+2 via on-chain atomic settlement |
| **Use of Proceeds** | 60% Asia logistics infrastructure; 25% cross-border supply chain; 15% working capital |
| **Governing Law** | Singapore |
| **Trustee & Counsel** | Clifford Chance LLP |
| **Prospectus Commitment** | keccak256 hash of full prospectus stored in `ComplianceOracle` |
| **On-Chain Standard** | Casper-native WASM (primary); ERC-3643 on Mantle Sepolia (fallback) |

---

## Demo Walkthrough

> All steps produce real Casper Testnet transactions verifiable at [testnet.cspr.live](https://testnet.cspr.live).

**Step 1 — Issuer drafts asset** (`/prospectus`)

Input: asset name, type, issuer details, coupon rate. AI generates SFC-compliant offering memorandum and term sheet in ~10 seconds. Output: downloadable prospectus with SFC reference.

**Step 2 — AI Compliance Scoring** (`/compliance`)

AI scores against 20 SFC rules; produces structured JSON report. Example output: score = 85/100, SHA-256 report hash = `0xabc...`. On-chain: `submit_score("hibt06181409", 85, hash)` called on `ComplianceOracle`. Casper tx: [88f7511e...](https://testnet.cspr.live/deploy/88f7511e752793b97716668e2e259fbc4378c58a6b2df961fbbfd9296025c5a5)

**Step 3 — Regulator Approval** (`/regulator`)

Regulator reviews AI compliance report and on-chain score. One-click approval writes approval flag to contract. *Try skipping this step — mint will fail at contract level.*

**Step 4 — Investor KYC** (`/kyc` + `/admin/kyc`)

Investor submits jurisdiction and documents; AI pre-screens. KYC admin reviews AI assessment and grants eligibility. On-chain: `upsert_investor(investor_key, is_verified=true, aml_clear=true, ...)` to `IdentityRegistry`. *Try with revoked investor — mint will fail at contract level.*

**Step 5 — Gated Subscription** (`/subscribe`)

Investor pays CSPR to treasury. Example payment tx: [66fea681...](https://testnet.cspr.live/deploy/66fea6812a30b170ac954a6de587e6ce89bd9a0a1dd42a5a16d77c3ba5a3048e). Contract checks: `score >= 70`, `approved = true`, `kyc_eligible = true`. All three must pass or the transaction is rejected by the contract.

**Step 6 — Portfolio & Coupon** (`/portfolio`)

AI Advisor reads live contract state: `balance_of()`, `get_coupon()`, funded status. Explains semi-annual coupon schedule and expected yield. Issuer funds coupon period via `record_coupon()`. Investor claims via `settle_purchase()`.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 · React 19 · TypeScript · Tailwind CSS |
| **Casper Contracts** | Rust · Odra Framework · WASM · `casper-contract` SDK |
| **EVM Contracts (fallback)** | Solidity 0.8.24 · Hardhat · TypeChain · ERC-3643 |
| **AI / Agents** | OpenAI-compatible LLM · SFC JSON rule engine · SiliconFlow provider |
| **Primary Chain** | Casper Testnet (`casper-test`) |
| **Compliance Rules** | 20 rules in `compliance-rules/sfc-rules.json`, 5 asset type configurations |
| **API Routes** | 25 Next.js route handlers (Node.js runtime) |

---

## Quick Start

```bash
git clone <repo>
cd app
npm install
npm run dev
# --> http://localhost:3000
```

### Environment Variables

Create `app/.env.local`:

```env
# Casper signing keys (server-side only)
CASPER_ORACLE_KEY=<ed25519-private-key-hex>
CASPER_ORACLE_PUBLIC_KEY=<ed25519-public-key-hex>
CASPER_TREASURY_PUBLIC_KEY=<ed25519-public-key-hex>

# Network
CASPER_CHAIN_NAME=casper-test
CASPER_RPC_URL=https://rpc.testnet.casperlabs.io
CASPER_DEPLOY_TIMEOUT_MS=300000

# AI provider (one of)
SILICONFLOW_API_KEY=<api-key>
OPENAI_API_KEY=<api-key>
```

### Build Casper WASM Contracts

**Linux / macOS:**
```bash
cargo install cargo-odra --locked
cd app/contracts-casper/compliance-oracle && cargo odra build -b casper
cd app/contracts-casper/identity-registry  && cargo odra build -b casper
cd app/contracts-casper/token-coupon       && cargo odra build -b casper
```

**Windows — via GitHub Actions:**
1. Push to GitHub → run **Actions → Build Casper WASM Contracts**
2. Download `casper-contract-wasm` artifact
3. Set `CASPER_TOKEN_WASM_PATH` in `.env.local`

### Deploy to Casper Testnet

```powershell
# Windows
.\deploy-casper-contracts.ps1 -AccountKey <ed25519-hex> -PublicKey <pub-hex>
```

```bash
# Linux / macOS
casper-client put-deploy \
  --node-address https://rpc.testnet.casperlabs.io \
  --chain-name casper-test \
  --secret-key-hex <key> \
  --payment-amount 200000000000 \
  --session-path wasm/compliance_oracle_build_contract.wasm
```

Testnet CSPR faucet: https://testnet.cspr.live/tools/faucet

---

## Long-Term Vision

**6 months — Production**
- Mainnet deployment on Casper
- Expand SFC rules to MAS (Singapore), DFSA (Dubai), and SEC frameworks
- Multi-asset class support: equities, credit, real estate

**12 months — Ecosystem Integration**
- Integrate **Casper x402 micropayments** for pay-per-compliance-check API pricing *(planned)*
- Connect **Casper MCP Server** for AI agent direct blockchain queries *(planned)*
- White-label compliance-as-a-service for Asian asset managers

**18 months — AI Agent Economy**
- On-chain reputation scoring for compliance AI agents (verifiable accuracy track record)
- Multi-agent DAO governance for issuer approval workflows
- Machine-to-machine coupon servicing via autonomous agent settlement

HarbourRWA demonstrates Casper as the **trust layer for AI-driven regulated finance**. Every AI agent decision in this system terminates at a Casper transaction.

---

## Repository Structure

```
app/
├── src/
│   ├── app/
│   │   ├── prospectus/          # AI prospectus drafting
│   │   ├── tokenize/            # Asset registration + WASM deploy
│   │   ├── compliance/          # AI scoring + oracle write
│   │   ├── audit/               # AI contract due diligence
│   │   ├── regulator/           # Regulator approval dashboard
│   │   ├── kyc/                 # Investor KYC submission
│   │   ├── admin/kyc/           # KYC admin approval
│   │   ├── subscribe/           # Gated mint + CSPR payment
│   │   ├── portfolio/           # Coupon claims + AI advisor
│   │   └── api/                 # 25 Next.js route handlers
│   └── lib/
│       ├── casper-chain.ts      # Casper deploy and state-read layer
│       ├── casper-token-deploy.ts  # WASM deploy + waitForDeploy
│       └── chain.ts             # EVM chain helpers (fallback)
├── contracts-casper/
│   ├── compliance-oracle/       # Rust / Odra WASM
│   ├── identity-registry/       # Rust / Odra WASM
│   └── token-coupon/            # Rust / Odra WASM
├── contracts/
│   └── contracts/               # Solidity ERC-3643 (fallback)
├── compliance-rules/
│   └── sfc-rules.json           # 20 SFC rules, 5 asset types
└── data/
    ├── deployments.json         # On-chain deployment registry
    ├── kyc-inbox.json           # KYC applications
    └── sfc-inbox.json           # Compliance submissions
```

---

<div align="center">

*Built for the Casper Agentic Buildathon 2026 · [dorahacks.io/hackathon/casper-agentic-buildathon](https://dorahacks.io/hackathon/casper-agentic-buildathon)*

**HarbourRWA — Where AI Decisions Become On-Chain Law.**

</div>
