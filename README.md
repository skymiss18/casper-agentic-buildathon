# NexusRWA

End-to-end AI-assisted RWA issuance workflow on Casper Testnet, with compliance scoring, identity gating, and coupon lifecycle recorded through Casper smart contracts.


## Final Round Qualification Checklist

Use this section as the source-of-truth checklist for final-round review.

| Requirement | Status | Evidence / Action |
|---|---|---|
| Public GitHub repository with clear naming | Complete | Repository is public and named `casper-agentic-buildathon` |
| Repository description, website, and topics (`casper-blockchain`, `casper-network`, `buildathon`) | Pending metadata verification on GitHub UI | See "Repository Metadata (GitHub)" section below |
| Comprehensive README | Complete (this file) | Architecture, setup, deployment, and reproducible verification steps |
| Community standards (Code of Conduct, Contributing, Security Policy, Support) | Partial | Workflow exists in `.github/workflows`; community health files should be added under `.github/` |
| CodeQL enabled | Pending verification on GitHub Security tab | See "Security and CI" section |
| Dependabot alerts + updates enabled | Pending verification on GitHub Security tab | See "Security and CI" section |
| High+ security alerts fixed | Pending verification on GitHub Security tab | Final submission target: 0 open High/Critical alerts |
| Functional MVP on Casper Testnet | Complete | Deployment record and explorer transaction in `app/data/deployments.json` |
| Intuitive workflow + demo video or DoraHacks playbook | Partial | Playbook below; replace demo placeholder with final URL |
| Contract package hashes and sample Testnet transactions documented on BUIDL page | Partial | Contract/deploy evidence table below; fill package hash entries if redeployed |


## Repository Metadata (GitHub)

Set these repository fields in GitHub Settings so reviewers can validate quickly:

- Description: `Agentic RWA issuance MVP on Casper Testnet with compliance and identity-gated token coupon lifecycle.`
- Website: `<BUIDL_OR_PROJECT_URL>`
- Topics (minimum): `casper-blockchain`, `casper-network`, `buildathon`
- Suggested extra topics: `rwa`, `compliance`, `ai-agent`, `odra`, `wasm`, `nextjs`


## GitHub Community Standards

Community profile target path: `https://github.com/<ORG_OR_USER>/<REPO>/community`

Recommended files under `.github/` for full health score:

- `.github/CODE_OF_CONDUCT.md`
- `.github/CONTRIBUTING.md`
- `.github/SECURITY.md`
- `.github/SUPPORT.md`
- Issue templates under `.github/ISSUE_TEMPLATE/`
- Optional: `.github/pull_request_template.md`

Current repository already includes CI workflow:

- `.github/workflows/build-casper-contracts.yml`



## Submission Readiness (DoraHacks)

| Requirement | Status | Evidence |
|---|---|---|
| Working prototype on Casper Testnet with transaction-producing on-chain component | Complete | Deploy record in `app/data/deployments.json` and explorer link below |
| Open-source repository with README and usage instructions | Complete | This repository + setup/run steps below |
| Public demo video | Pending link update | Add final public URL in Demo section |

## Security and CI

### CI Status

- Casper contract build/test workflow: `.github/workflows/build-casper-contracts.yml`
- Builds Rust/Odra contracts and runs `cargo odra test` for key modules.

### Security Configuration Checklist

Enable and verify in GitHub repository settings:

1. Code scanning (CodeQL default setup)
2. Dependabot alerts
3. Dependabot security updates
4. Dependabot version updates (recommended)
5. Secret scanning (if available for your plan)

Submission target:

- Open High/Critical alerts: **0**

Suggested verification command for local dependency hygiene:

```bash
# Node ecosystem
cd app && npm audit --audit-level=high

# Rust ecosystem (install once: cargo install cargo-audit)
cd app/contracts-casper && cargo audit
```

If any High/Critical issue appears, patch and re-run before final submission.


## Demo and BUIDL Links

- Demo video: `<PASTE_PUBLIC_DEMO_VIDEO_URL>`
- DoraHacks / BUIDL page: `<PASTE_BUIDL_PAGE_URL>`
- Testing playbook (if hosted separately): `<OPTIONAL_PLAYBOOK_URL>`

## What This Project Does

NexusRWA is a full workflow for regulated-style token issuance:

1. AI drafts offering content from issuer inputs.
2. AI scores the submission against SFC-oriented rules.
3. Compliance score evidence is anchored to Casper via `ComplianceOracle`.
4. Regulator and KYC admin remain human-in-the-loop.
5. Minting/subscription flows are executed by authorized mint authority on Casper.
6. Coupon metadata and investor balances are recorded on-chain.

This repository focuses on a working Casper prototype for the buildathon round.

## Judge Quick Proof (3-5 Minute Scan)

### 1) Casper On-Chain Deployment Proof

Source of truth: `app/data/deployments.json`

| Item | Value |
|---|---|
| Network | Casper Testnet |
| Deploy hash | `4c3df0d87420700ab312597e0c5d3c01081963b074d16c8dffe7074600c76556` |
| Explorer | https://testnet.cspr.live/deploy/4c3df0d87420700ab312597e0c5d3c01081963b074d16c8dffe7074600c76556 |
| Contract hash | `contract-5433399954f15e10c02ee6064fe28ac1c7fefafd5d05b9e9728b585c30fd0fa1` |
| Asset id | `nibt2` |
| Standard | Casper Token/Coupon WASM |

## Contract Package Hashes and Testnet Transactions

Use this table directly on your BUIDL page.

### A) Contract Registry (Casper Testnet)

| Contract | Package Hash | Contract Hash | Deploy Hash | Explorer | Description |
|---|---|---|---|---|---|
| TokenCoupon | `<FILL_IF_AVAILABLE>` | `contract-5433399954f15e10c02ee6064fe28ac1c7fefafd5d05b9e9728b585c30fd0fa1` | `4c3df0d87420700ab312597e0c5d3c01081963b074d16c8dffe7074600c76556` | https://testnet.cspr.live/deploy/4c3df0d87420700ab312597e0c5d3c01081963b074d16c8dffe7074600c76556 | Core token/coupon lifecycle state |
| ComplianceOracle | `<FILL_PACKAGE_HASH>` | `<FILL_CONTRACT_HASH>` | `<FILL_DEPLOY_HASH>` | `<FILL_EXPLORER_URL>` | On-chain compliance score anchoring |
| IdentityRegistry | `<FILL_PACKAGE_HASH>` | `<FILL_CONTRACT_HASH>` | `<FILL_DEPLOY_HASH>` | `<FILL_EXPLORER_URL>` | Investor eligibility/KYC registry |

### B) Sample Testnet Transactions

| Tx Type | Deploy / Tx Hash | Explorer | Expected Outcome |
|---|---|---|---|
| Deploy TokenCoupon | `4c3df0d87420700ab312597e0c5d3c01081963b074d16c8dffe7074600c76556` | https://testnet.cspr.live/deploy/4c3df0d87420700ab312597e0c5d3c01081963b074d16c8dffe7074600c76556 | Token coupon contract available on Casper Testnet |
| Subscribe flow test | `<FILL_FROM_TEST_OUTPUT>` | `<FILL_EXPLORER_URL>` | Investor subscription state updated |
| Settlement/payment verification | `<FILL_FROM_TEST_OUTPUT>` | `<FILL_EXPLORER_URL>` | Payment/settlement checks pass |
| Mint authorization negative test | `<FILL_FROM_TEST_OUTPUT>` | `<FILL_EXPLORER_URL>` | Unauthorized mint rejected as expected |

Record these hashes from your latest final demo run and keep them synchronized with `app/data/deployments.json`.

### 2) Smart Contracts Implemented in Rust/Odra

- `app/contracts-casper/compliance-oracle/src/lib.rs`
  - `submit_score(asset_id, score, report_hash)`
  - `get_score(asset_id)`
  - `is_compliant(asset_id, threshold)`
- `app/contracts-casper/identity-registry/src/lib.rs`
  - `upsert_investor(...)`
  - `is_eligible(investor)`
  - `revoke_investor(investor)`
- `app/contracts-casper/token-coupon/src/lib.rs`
  - `init(...)`
  - `mint_to(...)`, `subscribe(...)`, `settle_purchase(...)`
  - `record_coupon(...)`
  - `balance_of(...)`, `get_coupon(...)`, `get_metadata()`

### 3) Compliance Ruleset in Repository

- Rule source: `app/compliance-rules/sfc-rules.json`
- Includes core SFC rules plus asset-class extensions (bond, trade receivable, green bond, REIT).
- The bond demo corpus is provided in `app/test/HIBT-Prospectus.txt`.

## Architecture

```mermaid
flowchart LR
  A[Issuer inputs] --> B[AI Draft + Compliance Scoring]
  B --> C[ComplianceOracle on Casper]
  D[Regulator Review] --> C
  E[KYC Admin Review] --> F[IdentityRegistry on Casper]
  C --> G[Mint Authority Service]
  F --> G
  G --> H[TokenCoupon on Casper]
  H --> I[Investor Balance and Coupon Records]
```

## Agentic + Human-in-the-Loop Model

- AI is used for drafting, document analysis, and scoring assistance.
- Regulator and KYC admin remain explicit decision makers.
- Casper contracts store key issuance and lifecycle state.
- Minting is protected by authorization (`owner` or `mint_authority`) at the contract level.

Note: In this buildathon prototype, some compliance gating is performed by authorized service logic that writes/executes on Casper, rather than all checks being embedded as direct cross-contract calls inside `token-coupon`.

## Application Routes

UI routes under `app/src/app`:

- `/prospectus`
- `/tokenize`
- `/compliance`
- `/audit`
- `/regulator`
- `/kyc`
- `/admin/kyc`
- `/subscribe`
- `/portfolio`

API routes under `app/src/app/api` include:

- `/api/tokenize/*`
- `/api/compliance/*`
- `/api/kyc/*`
- `/api/subscribe/*`
- `/api/portfolio/*`
- `/api/audit/*`
- `/api/advisor/*`

## Technology Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Casper contracts: Rust + Odra + WASM
- EVM fallback contracts (secondary path): Solidity + Hardhat
- AI layer: OpenAI-compatible provider and rule-based scoring pipeline
- Data artifacts: local JSON registries in `app/data`

## Quick Start

```bash
git clone <repo>
cd casper-agentic-buildathon/app
npm install
npm run dev
```

Open: http://localhost:3000

## Environment

Create `app/.env.local`:

```env
CASPER_CHAIN_NAME=casper-test
CASPER_RPC_URL=https://rpc.testnet.casperlabs.io
CASPER_DEPLOY_TIMEOUT_MS=300000

CASPER_ORACLE_KEY=<ed25519-private-key-hex>
CASPER_ORACLE_PUBLIC_KEY=<ed25519-public-key-hex>
CASPER_TREASURY_PUBLIC_KEY=<ed25519-public-key-hex>

SILICONFLOW_API_KEY=<api-key>
# or
OPENAI_API_KEY=<api-key>
```

## Build Casper WASM Contracts

```bash
cargo install cargo-odra --locked
cd app/contracts-casper/compliance-oracle && cargo odra build -b casper
cd app/contracts-casper/identity-registry && cargo odra build -b casper
cd app/contracts-casper/token-coupon && cargo odra build -b casper
```

## Deploy to Casper Testnet (PowerShell)

```powershell
.\deploy-casper-contracts.ps1 -AccountKey <ed25519-hex> -PublicKey <pub-hex>
```

Testnet faucet: https://testnet.cspr.live/tools/faucet

## Reproducible Evidence Commands

From repository root:

```powershell
node test-subscribe.mjs
node test-payment-verification.mjs
node test-mint-error.mjs
```

From `app` directory:

```powershell
node test-deploy-server.cjs
```

## Reviewer Playbook (No Marketing, 8-12 Minutes)

This flow is intended for judges to validate functionality quickly.

### Prerequisites

1. Node.js 20+ and npm installed
2. Rust toolchain available for contract build checks
3. Testnet-funded Casper account if redeployment is needed
4. `app/.env.local` configured

### Step-by-Step Validation

1. Install and run app

```bash
cd app
npm install
npm run dev
```

Expected: local UI opens at `http://localhost:3000` with tokenize/compliance/kyc/subscribe routes available.

2. Build Casper contracts

```bash
cd app/contracts-casper/compliance-oracle && cargo odra build -b casper
cd ../identity-registry && cargo odra build -b casper
cd ../token-coupon && cargo odra build -b casper
```

Expected: WASM outputs generated without build errors.

3. Verify deployment evidence

Inspect `app/data/deployments.json` and open listed explorer URL.

Expected: Casper Testnet deploy exists and status is successful.

4. Run scripted behavior checks

```bash
cd <repo-root>
node test-subscribe.mjs
node test-payment-verification.mjs
node test-mint-error.mjs
```

Expected:

- subscribe flow executes and records expected state
- payment verification script passes
- unauthorized mint scenario fails as designed

5. Validate API-backed route coverage

Manually visit and test:

- `/prospectus`
- `/tokenize`
- `/compliance`
- `/regulator`
- `/kyc`
- `/admin/kyc`
- `/subscribe`
- `/portfolio`

Expected: end-to-end workflow is navigable and actions produce corresponding data artifacts/API responses.

### What to Put on DoraHacks/BUIDL Page

1. Core contract package hash + contract hash + deploy hash
2. 3-5 representative Testnet transactions with one-line purpose each
3. Public demo video URL
4. Short reproducible test steps (copy from this section)

## How This README Maps to DoraHacks Judging

| Judging dimension | Where to evaluate in this repo |
|---|---|
| Technical Execution | Casper contracts in `app/contracts-casper`, API flows in `app/src/app/api` |
| Innovation and Originality | AI scoring + on-chain compliance anchoring workflow |
| Use of AI / Agentic Systems | Drafting/scoring/advisor flows in UI + API route design |
| Real-World Applicability | SFC-oriented rules in `app/compliance-rules/sfc-rules.json`, bond corpus in `app/test/HIBT-Prospectus.txt` |
| UX and Product Design | End-user pages under `app/src/app/*` |
| Working Smart Contracts | Testnet deploy record in `app/data/deployments.json` + explorer URL |
| Long-Term Launch Plan | Roadmap below |

## Roadmap

### Next 3 Months

- Harden Casper deployment reliability and monitoring.
- Add deterministic verification script for AI report hash to reduce trust assumptions.
- Improve judge-facing demo automation for full issuance walkthrough.

### Next 6-12 Months

- Expand jurisdictional rule packs (beyond current SFC-focused set).
- Increase automation for compliance lifecycle events with stricter controls.
- Package the workflow as compliance tooling for institutional issuers.

## Repository Structure

```text
app/
  compliance-rules/
    sfc-rules.json
  contracts-casper/
    compliance-oracle/
    identity-registry/
    token-coupon/
  data/
    deployments.json
    kyc-inbox.json
    sfc-inbox.json
  src/
    app/
    lib/
```

## Notes for Final Submission

- Replace demo video placeholder with public URL.
- Replace all `<FILL_...>` placeholders in Contract/Transaction tables.
- Ensure repository metadata (description, website, topics) is set in GitHub.
- Add/verify community health files under `.github/`.
- Enable CodeQL + Dependabot and resolve all High/Critical alerts.
- Keep deploy hashes in this README synchronized with `app/data/deployments.json`.
- If new deploy is used in final demo, update both this README and explorer links together.

## License

MIT