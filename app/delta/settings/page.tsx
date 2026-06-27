"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import { useDelta } from "@/lib/delta/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ${
        on ? "bg-vio/70" : "bg-white/[0.1]"
      }`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 34 }}
        className="absolute top-1/2 h-[16px] w-[16px] -translate-y-1/2 rounded-full bg-ink shadow"
        style={{ left: on ? 19 : 3 }}
      />
    </button>
  );
}

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-[13px] text-ink">{title}</div>
        <div className="mt-0.5 text-[12px] text-faint">{desc}</div>
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { ledger, isSample } = useDelta();
  const accountCount = ledger?.accounts.length ?? 0;
  const [toggles, setToggles] = useState({
    billReminders: true,
    weeklyDigest: true,
    overspend: true,
    largeCharge: false,
    roundUp: true,
    hideBalances: false,
  });
  const flip = (k: keyof typeof toggles) =>
    setToggles((t) => ({ ...t, [k]: !t[k] }));

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Preferences for how delta tracks and notifies you."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="px-5 py-5" i={0}>
          <CardHeader eyebrow="Profile" title="Account" className="mb-4" />
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-vio/30 to-sky/20 font-display text-[18px] font-medium text-ink">
              K
            </div>
            <div>
              <div className="text-[14px] font-medium text-ink">Kevin Nguyen</div>
              <div className="text-[12px] text-faint">kevinnguyen313@icloud.com</div>
            </div>
          </div>
          <div className="mt-5 flex flex-col divide-y divide-edge/60 border-t border-edge pt-1">
            <Row title="Base currency" desc="Used across every balance and chart">
              <span className="font-mono text-[12px] text-mute">USD ($)</span>
            </Row>
            <Row title="Hide balances" desc="Blur dollar amounts until you tap">
              <Toggle on={toggles.hideBalances} onClick={() => flip("hideBalances")} />
            </Row>
          </div>
        </Card>

        <Card className="px-5 py-5" i={1}>
          <CardHeader eyebrow="Notifications" title="Alerts" className="mb-4" />
          <div className="flex flex-col divide-y divide-edge/60">
            <Row title="Bill reminders" desc="A nudge before recurring charges hit">
              <Toggle on={toggles.billReminders} onClick={() => flip("billReminders")} />
            </Row>
            <Row title="Weekly digest" desc="Sunday summary of the week's money">
              <Toggle on={toggles.weeklyDigest} onClick={() => flip("weeklyDigest")} />
            </Row>
            <Row title="Overspend warnings" desc="Ping when a budget tips over its limit">
              <Toggle on={toggles.overspend} onClick={() => flip("overspend")} />
            </Row>
            <Row title="Large charge alerts" desc="Flag any single charge over $250">
              <Toggle on={toggles.largeCharge} onClick={() => flip("largeCharge")} />
            </Row>
          </div>
        </Card>

        <Card className="px-5 py-5" i={2}>
          <CardHeader eyebrow="Automation" title="Saving rules" className="mb-4" />
          <div className="flex flex-col divide-y divide-edge/60">
            <Row title="Round-up savings" desc="Round each purchase up and sweep the change">
              <Toggle on={toggles.roundUp} onClick={() => flip("roundUp")} />
            </Row>
            <Row title="Auto-categorize" desc="Sort new transactions by merchant rules">
              <span className="font-mono text-[12px] text-mute">14 rules</span>
            </Row>
          </div>
        </Card>

        <Card className="px-5 py-5" i={3}>
          <CardHeader eyebrow="Security & data" title="Privacy" className="mb-4" />
          <div className="flex flex-col divide-y divide-edge/60">
            <Row title="App lock" desc="Shared PIN gate with alpha at the portal">
              <span className="font-mono text-[11px] text-pos">Enabled</span>
            </Row>
            <Row title="Accounts" desc="Balances you track in delta">
              <span className="font-mono text-[12px] text-mute">{accountCount} accounts</span>
            </Row>
            <Row title="Your data" desc="Import a CSV, load the sample, or clear it">
              <Link href="/delta/import" className="font-mono text-[12px] text-vio/80 transition-colors hover:text-vio">
                Manage →
              </Link>
            </Row>
          </div>
          <p className="mt-4 rounded-lg border border-edge bg-white/[0.02] px-3 py-2.5 text-[11.5px] leading-relaxed text-faint">
            {isSample
              ? "delta is showing illustrative sample data. Everything you change is saved to this browser only — nothing is sent anywhere."
              : "Your delta ledger lives in this browser's local storage only — nothing is sent anywhere."}
          </p>
        </Card>
      </div>
    </div>
  );
}
