# **HarbourRWA**

> AI + RWA infrastructure on Mantle: from compliance review to issuance, subscription, coupon servicing, and investor guidance.

## **DoraHacks Summary**

HarbourRWA is a human-in-the-loop RWA infrastructure project built on Mantle. It combines AI decision support with on-chain enforcement so that compliance review, investor eligibility, regulator approval, mint permission, coupon servicing, and portfolio assistance are connected in one verifiable workflow.

This project is not just about tokenizing an asset.

- AI is used to draft and analyze regulated issuance materials.
- Smart contracts are used to enforce who can issue, subscribe, mint, and claim.
- Human actors remain in control at every decision point.

The result is a more realistic RWA stack: AI improves workflow speed and structure, while Mantle guarantees that the approved result becomes executable infrastructure.

## **The Problem**

Most RWA demos stop at one of these points:

- a token gets deployed, but the compliance path is off-chain
- AI is shown as a chatbot, but its output has no contract consequence
- investor onboarding and post-issuance servicing are missing

That leaves a major gap between a tokenization demo and a usable regulated asset workflow.

## **Our Solution**

HarbourRWA closes that gap with an end-to-end pipeline:

1. The issuer drafts and submits an asset package.
2. AI performs structured compliance review and produces scoreable output.
3. Sponsor and regulator roles review and approve the issuance.
4. Investor KYC and eligibility are written into on-chain identity state.
5. Minting is gated by oracle score, approval state, and investor eligibility.
6. Coupon funding and investor claims are executed on-chain.
7. AI continues into the post-issuance phase through investor Q&A and portfolio guidance.

## **Why AI + RWA Matters**

The key innovation is the connection between AI output and contract enforcement.

- AI is not only generating text. It produces structured compliance and workflow signals.
- Those signals are turned into on-chain permission checks through the project contracts.
- The project keeps regulators, sponsors, compliance officers, issuers, and investors in the loop instead of pretending AI replaces them.

In one sentence: **AI creates structured decision support, and Mantle turns approved outcomes into enforceable state.**

## **What Judges Can Verify**

Judges can verify three concrete proof loops:

1. AI compliance becomes on-chain permission.
The compliance engine scores the submission, binds the result to a report hash, and writes it to `ComplianceOracle.sol`. Minting logic can read that state directly.

2. Regulated issuance becomes contract-enforced.
Approval is not a mock flag in the UI. If approval, oracle score, or investor eligibility is missing, the mint path fails at contract level.

3. Post-issuance servicing is actually implemented.
The issuer funds coupon distributions on-chain, the investor claims them on-chain, and the portfolio layer reads live holdings and schedule data.

## **Product Scope**

HarbourRWA includes role-specific flows for the main participants in regulated issuance:

- Issuer
- Sponsor / compliance reviewer
- Regulator
- Investor
- KYC administrator

Core application surfaces:

- `/prospectus`: AI drafting and document preparation
- `/tokenize`: issuer submission and deployment path
- `/compliance`: sponsor review, scoring, and oracle submission
- `/audit`: smart contract due diligence surface
- `/regulator` and `/regulator/issuance`: oversight and approval flow
- `/kyc` and `/admin/kyc`: investor onboarding and approval
- `/subscribe`: subscription and compliance-gated minting
- `/portfolio`: coupon funding, coupon claim, AI advisor, and allocation guidance

## **Why This Is Strong For DoraHacks**

HarbourRWA fits the Human-Driven RWA Infrastructure theme because it focuses on real workflow enforcement instead of UI simulation.

- It uses AI where regulated workflows are expensive and document-heavy.
- It uses Mantle where trust and execution guarantees matter.
- It shows the full lifecycle, not only issuance.
- It keeps humans responsible for approvals while making the final state auditable and programmable.

## **Smart Contract Architecture**

Main contracts:

- `ComplianceOracle.sol`: stores compliance score and report hash per asset
- `IdentityRegistry.sol`: stores investor eligibility and identity-related state
- `ComplianceModule.sol`: enforces mint and transfer gating
- `HarbourRWAToken.sol`: token logic, coupon schedule, funding, and claims
- `YieldAggregator.sol`: allocation surface used by the advisor flow

Critical on-chain states:

- compliance score
- compliance report hash
- investor eligibility
- mint permission
- coupon funding and coupon claims

## **Demo Flow**

Recommended judging flow:

1. Generate the prospectus draft with AI.
2. Submit the issuance package.
3. Run compliance review and write the result on-chain.
4. Approve the issuance from the regulator flow.
5. Complete KYC and approve investor eligibility.
6. Subscribe and mint only after checks pass.
7. Fund coupon distribution.
8. Claim coupon as the investor.
9. Use the AI advisor to explain the next coupon event and suggest allocation changes.

## **Technical Highlights**

- Next.js 16 + React 19 + TypeScript frontend
- Solidity 0.8.24 + Hardhat smart contracts
- Mantle deployment target
- AI-assisted prospectus, compliance, KYC, and portfolio flows
- Contract-level enforcement instead of UI-only gating

## **Local Setup**

```bash
cd app
npm install

cd contracts
npm install
npm run compile
npm run deploy:testnet

cd ..
npm run dev
```

Required environment variables:

- `DEPLOYER_PRIVATE_KEY`
- `SILICONFLOW_API_KEY`
- `MANTLESCAN_API_KEY`
- `NEXT_PUBLIC_COMPLIANCE_ORACLE_ADDRESS`
- `NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS`

## **Deployed Contracts (Mantle Sepolia, Chain ID 5003)**

| Contract | Address | Explorer |
|----------|---------|---------|
| `ComplianceOracle.sol` | `0xe9B84c856d4D0c6bE37D75E6e8fdb7f3C75DcAFD` | [MantleScan](https://sepolia.mantlescan.xyz/address/0xe9B84c856d4D0c6bE37D75E6e8fdb7f3C75DcAFD) |
| `IdentityRegistry.sol` | `0x47e231d6b090C2bBFF760a741687aFa99ebe3031` | [MantleScan](https://sepolia.mantlescan.xyz/address/0x47e231d6b090C2bBFF760a741687aFa99ebe3031) |
| `ComplianceModule.sol` | `0xcAc067b92B910711AC31032eb35c711527a44699` | [MantleScan](https://sepolia.mantlescan.xyz/address/0xcAc067b92B910711AC31032eb35c711527a44699) |
| `HarbourRWAToken.sol` (HIBT) | `0x5b92134F804a766C566Ab253F40642F28E9b3007` | [MantleScan](https://sepolia.mantlescan.xyz/address/0x5b92134F804a766C566Ab253F40642F28E9b3007) |
| `YieldAggregator.sol` | `0x446C5EEBD12463eC688CC459a8802bF9718CB364` | [MantleScan](https://sepolia.mantlescan.xyz/address/0x446C5EEBD12463eC688CC459a8802bF9718CB364) |

Key on-chain evidence:

- **AI compliance oracle write (HIBT)**: [`0xd9067568...`](https://sepolia.mantlescan.xyz/tx/0xd9067568c7915fa20f33b8b362f499aa3a06ee0adecb0786a8c1d11fd083fad0)
- **SFC regulator approval**: [`0xae1d9b58...`](https://sepolia.mantlescan.xyz/tx/0xae1d9b58b240f68c63f2caa0594ee21360e8efc48153ad4454703bb64c1098d8)
- **HIBT token deploy**: [`0x30e86a06...`](https://sepolia.mantlescan.xyz/tx/0x30e86a0670ca0cb9bdc4e0ca09f8b3579acb63563c6dade636258eeef310a384)

## **Architecture Overview**

```
Frontend (Next.js 16 + React 19 + Tailwind)
  /prospectus  → AI drafts SFC-compliant offering memorandum
  /compliance  → Sponsor reviews with AI; writes score to oracle
  /kyc         → Investor submits KYC docs; admin approves
  /subscribe   → Compliance-gated mint (oracle + KYC check)
  /portfolio   → Live holdings, coupon claim, AI yield advisor

Smart Contracts (Solidity 0.8.24, Mantle Sepolia)
  ComplianceOracle   ← AI writes score + report hash here
  IdentityRegistry   ← KYC state per investor address
  ComplianceModule   ← canMint() / canTransfer() gate
  HarbourRWAToken    ← ERC-3643 token, coupon schedule & claims
  YieldAggregator    ← Routes idle capital to USDY / mETH

AI Layer (SiliconFlow / OpenAI)
  Prospectus drafting  → structured SFC rule check → compliance score
  Score + hash         → ComplianceOracle.submitScore() on Mantle
  Post-issuance        → reads live holdings → portfolio guidance
```



HarbourRWA shows a credible path for AI in regulated finance: not replacing human oversight, but structuring decisions and turning approved outcomes into on-chain infrastructure. That is the difference between a tokenization demo and a usable RWA system.