"use client";

import { useState } from "react";

/** Collapsible "what's on-chain vs off-chain" comparison panel — makes the
 *  Track-4 "no underlying user data exposed on-chain" narrative explicit
 *  instead of implicit. Shared across /kyc, /admin/kyc, and /evidence. */
export default function DataBoundaryPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.10)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-[11px] font-semibold text-slate-700">
          On-chain vs Off-chain Data Boundary
        </span>
        <span className="text-slate-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 pb-4 text-[11px]">
          <div className="rounded-lg p-3" style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)" }}>
            <div className="font-semibold text-red-700 mb-1.5">Off-chain only · Server / Local storage</div>
            <ul className="space-y-1 text-slate-600 list-disc list-inside">
              <li>Full legal name, date of birth, contact details</li>
              <li>Government ID, proof-of-address, PI evidence documents</li>
              <li>Raw AI compliance scoring breakdown</li>
            </ul>
          </div>
          <div className="rounded-lg p-3" style={{ background: "rgba(22,163,74,0.04)", border: "1px solid rgba(22,163,74,0.15)" }}>
            <div className="font-semibold text-emerald-700 mb-1.5">On-chain · Casper contract</div>
            <ul className="space-y-1 text-slate-600 list-disc list-inside">
              <li>Credential commitment &amp; nullifier hash</li>
              <li>Proof hash (Groth16 proof digest)</li>
              <li>Risk band, is_verified / aml_clear flags</li>
              <li>KYC expiry timestamp</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
