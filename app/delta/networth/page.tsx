"use client";

import { Sparkline } from "@/components/charts/Sparkline";
import { ProgressBar } from "@/components/delta/bits";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import {
  ACCOUNTS,
  NET_WORTH_SERIES,
  netWorth,
  totalAssets,
  totalLiabilities,
} from "@/lib/delta/data";
import { fmtPct, fmtUSD, fmtUSDCompact } from "@/lib/format";

export default function NetWorthPage() {
  const first = NET_WORTH_SERIES[0].value;
  const last = NET_WORTH_SERIES[NET_WORTH_SERIES.length - 1].value;
  const yearChange = last - first;
  const yearChangePct = yearChange / first;
  const up = yearChange >= 0;

  const assets = ACCOUNTS.filter((a) => a.balance > 0).sort((a, b) => b.balance - a.balance);
  const liabilities = ACCOUNTS.filter((a) => a.balance < 0).sort(
    (a, b) => a.balance - b.balance
  );

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Net Worth"
        description="Everything you own minus everything you owe, tracked over the past year."
      />

      <Card className="relative mb-5 overflow-hidden px-6 py-6 sm:px-8" i={0}>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full blur-[90px]"
          style={{ background: "rgba(94,234,212,0.10)" }}
        />
        <div className="relative mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Net worth</div>
            <div className="mt-1.5 font-mono tnum text-[34px] font-medium leading-none text-ink sm:text-[40px]">
              {fmtUSD(netWorth, true)}
            </div>
          </div>
          <div className="flex gap-8">
            <Stat
              label="12-month change"
              value={yearChange}
              format={(v) => `${up ? "+" : "−"}${fmtUSDCompact(Math.abs(v))}`}
              toneClass={up ? "text-pos" : "text-neg"}
              sub={fmtPct(yearChangePct, 1, true)}
            />
            <Stat label="Assets" value={totalAssets} format={fmtUSDCompact} sub="total owned" />
            <Stat label="Liabilities" value={totalLiabilities} format={fmtUSDCompact} sub="total owed" />
          </div>
        </div>
        <div className="relative">
          <Sparkline values={NET_WORTH_SERIES.map((p) => p.value)} height={220} color="var(--color-mint)" />
          <div className="mt-2 flex">
            {NET_WORTH_SERIES.map((p) => (
              <div key={p.month} className="flex-1 text-center font-mono text-[10px] text-faint">
                {p.month}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="px-5 py-5" i={1}>
          <CardHeader eyebrow="Composition" title="Assets" className="mb-4" />
          <div className="flex flex-col gap-4">
            {assets.map((a) => (
              <div key={a.id}>
                <div className="mb-1.5 flex items-center justify-between text-[12px]">
                  <span className="text-mute">{a.name}</span>
                  <span className="font-mono tnum text-ink">
                    {fmtUSD(a.balance, true)}{" "}
                    <span className="text-faint">({fmtPct(a.balance / totalAssets, 0)})</span>
                  </span>
                </div>
                <ProgressBar value={a.balance} max={totalAssets} color="var(--color-mint)" />
              </div>
            ))}
          </div>
        </Card>

        <Card className="px-5 py-5" i={2}>
          <CardHeader eyebrow="Composition" title="Liabilities" className="mb-4" />
          <div className="flex flex-col gap-4">
            {liabilities.map((a) => (
              <div key={a.id}>
                <div className="mb-1.5 flex items-center justify-between text-[12px]">
                  <span className="text-mute">{a.name}</span>
                  <span className="font-mono tnum text-ink">
                    {fmtUSD(Math.abs(a.balance), true)}{" "}
                    <span className="text-faint">
                      ({fmtPct(Math.abs(a.balance) / totalLiabilities, 0)})
                    </span>
                  </span>
                </div>
                <ProgressBar
                  value={Math.abs(a.balance)}
                  max={totalLiabilities}
                  color="var(--color-neg)"
                />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
