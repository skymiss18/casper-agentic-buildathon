"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { connectCasperWallet, getCasperWalletProvider } from "@/lib/casper-wallet";

// Issuer — the entity that owns the underlying real-world asset
// Responsible for: initiating tokenization + the offering memorandum (legally the issuer's document)
const ISSUER_LINKS = [
  { href: "/tokenize",   step: "1", label: "Tokenise Asset",   desc: "Structure, audit & register issuance on Casper", isTool: false },
  { href: "/prospectus", step: "2", label: "Draft Prospectus", desc: "AI-assisted SFC-compliant offering memorandum",      isTool: false },
];

// Investor — professional or retail investor subscribing to tokens
const INVESTOR_LINKS = [
  { href: "/kyc",       step: "1", label: "Submit KYC",   desc: "Off-chain identity review with ZK-backed on-chain eligibility", isTool: false },
  { href: "/subscribe", step: "2", label: "Subscribe",    desc: "Place a token subscription order",                   isTool: false },
  { href: "/portfolio", step: "3", label: "My Portfolio", desc: "Track token holdings & yield income",                isTool: false },
];

// Intermediaries — SFC-licensed corporations (Type 1 & Type 6 LC)
// Type 1 LC (Distributor): client-facing KYC/AML under AMLO Cap.615
// Type 6 LC (Sponsor): pre-SFC compliance review + smart contract technical due diligence
const INTERMEDIARY_LINKS = [
  { href: "/compliance", step: "1", label: "Compliance Check",  desc: "AI review & SFC filing on behalf of Issuer (pre-authorisation)", isTool: false },
  { href: "/audit",      step: "2", label: "Contract Audit",    desc: "Smart contract technical due diligence before deployment",        isTool: false },
  { href: "/admin/kyc",  step: "3", label: "KYC Review",       desc: "Agent-assisted approve/update/revoke workflow for credentials",      isTool: false },
  { href: "/evidence",   step: "4", label: "Evidence",         desc: "Judge-facing board for AI checks, ZK commitments, and Casper proofs", isTool: false },
];

// SFC — Securities and Futures Commission, the primary securities regulator
// Pure oversight & approval role — does not use AI drafting tools
const REGULATOR_LINKS = [
  { href: "/regulator",          step: "1", label: "Oversight Dashboard", desc: "On-chain issuance records, market stats & compliance summary", isTool: false },
  { href: "/regulator/issuance", step: "2", label: "Issuance Review",     desc: "Approve or request changes on token issuance applications",    isTool: false },
];

function RoleDropdown({
  label,
  links,
  accentColor,
  activeHref,
}: {
  label: string;
  links: { href: string; step: string; label: string; desc: string; isTool?: boolean }[];
  accentColor: string;
  activeHref: string | null;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const hasActive = links.some((l) => l.href === activeHref);

  function show() {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
  }
  function hide() {
    timer.current = setTimeout(() => setOpen(false), 120);
  }

  // After any client-side navigation (including browser back), onMouseEnter won't
  // fire if the cursor was already over this element before the route change.
  // Sync open state by checking the :hover pseudo-class after each navigation.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (containerRef.current?.matches(":hover")) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [pathname]);

  return (
    <div ref={containerRef} className="relative" onMouseEnter={show} onMouseLeave={hide}>
      {/* Trigger button */}
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-all duration-150"
        style={{
          color:      hasActive ? "#111111" : "#666666",
          background: open || hasActive ? "rgba(0,0,0,0.05)" : "transparent",
          border: open || hasActive ? "1px solid rgba(0,0,0,0.12)" : "1px solid transparent",
        }}
      >
        {hasActive && (
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse-slow"
            style={{ background: accentColor }}
          />
        )}
        {label}
        <svg
          className="w-3 h-3 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "none", color: "#999999" }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 rounded-xl py-2 z-50"
          style={{
            minWidth: "272px",
            background: "#ffffff",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(0,0,0,0.10)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
          }}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <div
            className="px-3 pb-2 mb-1 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5"
            style={{ color: accentColor, borderBottom: "1px solid rgba(0,0,0,0.07)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: accentColor }} />
            {label} workflow
          </div>
          {links.map((l, i) => (
            <div key={l.href}>
              {/* Divider before first tool entry */}
              {l.isTool && !links[i - 1]?.isTool && (
                <div
                  className="px-3 pt-2.5 pb-1 text-[9px] font-bold uppercase tracking-widest"
                  style={{ color: "#999999", borderTop: "1px solid rgba(0,0,0,0.06)", marginTop: "4px" }}
                >
                  Standalone Tools
                </div>
              )}
              <Link
                href={l.href}
                className="flex items-start gap-3 px-3 py-2.5 transition-all duration-150 group rounded-md mx-1"
                style={{
                  background: l.href === activeHref ? `${accentColor}12` : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (l.href !== activeHref) e.currentTarget.style.background = "rgba(0,0,0,0.04)";
                }}
                onMouseLeave={(e) => {
                  if (l.href !== activeHref) e.currentTarget.style.background = "transparent";
                }}
              >
                {l.isTool ? (
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center text-[11px] shrink-0 mt-0.5"
                    style={{ background: "rgba(0,0,0,0.06)", color: "#666666" }}
                  >
                    ⚙
                  </span>
                ) : (
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                    style={{ background: accentColor, color: "white" }}
                  >
                    {l.step}
                  </span>
                )}
                <div>
                  <div
                    className="text-[13px] font-medium leading-snug transition-colors"
                    style={{ color: l.href === activeHref ? "#111111" : "#333333" }}
                  >
                    {l.label}
                  </div>
                  <div className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "#999999" }}>
                    {l.desc}
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const [casperPublicKey, setCasperPublicKey] = useState<string | null>(null);

  const issuerActive       = ISSUER_LINKS.find((l)      => pathname.startsWith(l.href))?.href ?? null;
  const investorActive     = INVESTOR_LINKS.find((l)    => pathname.startsWith(l.href))?.href ?? null;
  // Sort by href length desc so more-specific paths (e.g. /regulator/issuance) match before /regulator
  const intermediaryActive = [...INTERMEDIARY_LINKS].sort((a, b) => b.href.length - a.href.length).find((l) => pathname.startsWith(l.href))?.href ?? null;
  const regulatorActive    = [...REGULATOR_LINKS].sort((a, b) => b.href.length - a.href.length).find((l) => pathname.startsWith(l.href))?.href ?? null;

  useEffect(() => {
    let active = true;

    async function syncWallet() {
      try {
        const provider = getCasperWalletProvider();
        const connected = await provider.isConnected();
        if (!connected || !active) return;
        const publicKey = await provider.getActivePublicKey();
        if (active && publicKey) setCasperPublicKey(publicKey);
      } catch {
        if (active) setCasperPublicKey(null);
      }
    }

    void syncWallet();
    return () => {
      active = false;
    };
  }, []);

  async function handleConnectCasper() {
    try {
      const { publicKey } = await connectCasperWallet();
      setCasperPublicKey(publicKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to connect Casper Wallet";
      alert(msg);
    }
  }

  async function handleDisconnectCasper() {
    try {
      const provider = getCasperWalletProvider();
      await provider.disconnectFromSite();
    } catch {
      // Ignore provider disconnect errors and clear local state anyway.
    } finally {
      setCasperPublicKey(null);
    }
  }

  return (
    <nav
      style={{
        background: "rgba(247,245,240,0.92)",
        backdropFilter: "blur(14px) saturate(150%)",
        WebkitBackdropFilter: "blur(14px) saturate(150%)",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
      }}
      className="sticky top-0 z-50"
    >
      <div
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between"
        style={{ height: "52px" }}
      >
        {/* Left: logo + role dropdowns */}
        <div className="flex items-center gap-2">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 mr-3 group">
            <Image
              src="/logo.png"
              alt="NexusRWA"
              width={32}
              height={32}
              className="rounded-lg"
              priority
            />
            <span className="text-[13px] font-semibold tracking-tight hidden sm:block" style={{ color: "#111111", letterSpacing: "-0.01em" }}>
              NexusRWA
            </span>
          </Link>

          <RoleDropdown
            label="Issue"
            links={ISSUER_LINKS}
            accentColor="#3b82f6"
            activeHref={issuerActive}
          />
          <RoleDropdown
            label="Intermediate"
            links={INTERMEDIARY_LINKS}
            accentColor="#f59e0b"
            activeHref={intermediaryActive}
          />
          <RoleDropdown
            label="Regulate"
            links={REGULATOR_LINKS}
            accentColor="#a78bfa"
            activeHref={regulatorActive}
          />
          <RoleDropdown
            label="Invest"
            links={INVESTOR_LINKS}
            accentColor="#10b981"
            activeHref={investorActive}
          />
        </div>

        {/* Right: wallet + admin + chain */}
        <div className="flex items-center gap-3">
          {casperPublicKey ? (
            <button
              onClick={handleDisconnectCasper}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150"
              style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.15)", color: "#333333" }}
              title="Disconnect Casper Wallet"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse-slow" />
              <span className="font-mono">{casperPublicKey.slice(0, 8)}…{casperPublicKey.slice(-6)}</span>
            </button>
          ) : (
            <button
              onClick={handleConnectCasper}
              className="btn-primary flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z" />
                <circle cx="17" cy="14" r="1.5" fill="currentColor" />
              </svg>
              Connect Casper Wallet
            </button>
          )}

          {/* chain info — hidden */}
        </div>
      </div>
    </nav>
  );
}
