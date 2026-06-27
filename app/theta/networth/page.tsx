"use client";

import { Sparkline } from "@/components/charts/Sparkline";
import { ProgressBar } from "@/components/theta/bits";
import { ThetaEmpty } from "@/components/theta/ui";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { ledgerHasData, useTheta } from "@/lib/theta/store";
import { fmtPct, fmtUSD, fmtUSDCompact } from "@/lib/format";

export default function NetWorthPage() {
  const { ready, ledger, view } = useTheta();

  if (!ready) return null;
  if (!ledger || !view || !ledgerHasData(ledger)) return <ThetaEmpty page="Net worth" />;

  const series = view.netWorthSeries;
  const first = series[0]?.value ?? view.netWorth;
  const last = view.netWorth;
  const yearChange = last - first;
  const yearChangePct = first !== 0 ? yearChange / first : 0;
  const up = yearChange >= 0;

  const assets = ledger.accounts.filter((a) => a.balance > 0).sort((a, b) => b.balance - a.balance);
  const liabilities = ledger.accounts.filter((a) => a.balance < 0).sort((a, b) => a.balance - b.balance);

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Net Worth"
        description="Everything you own minus everything you owe, tracked over time."
      />

      <Card className="relative mb-5 overflow-hidden px-6 py-6 sm:px-8" i={0}>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full blur-[90px]" style={{ background: "rgba(94,234,212,0.10)" }} />
        <div className="relative mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Net worth</div>
            <div className="mt-1.5 font-mono tnum text-[34px] font-medium leading-none text-ink sm:text-[40px]">{fmtUSD(last, true)}</div>
          </div>
          <div className="flex gap-8">
            <Stat
              label={`${series.length}-month change`}
              value={yearChange}
              format={(v) => `${up ? "+" : "−"}${fmtUSDCompact(Math.abs(v))}`}
              toneClass={up ? "text-pos" : "text-neg"}
              sub={fmtPct(yearChangePct, 1, true)}
            />
            <Stat label="Assets" value={view.totalAssets} format={fmtUSDCompact} sub="total owned" />
            <Stat label="Liabilities" value={view.totalLiabilities} format={fmtUSDCompact} sub="total owed" />
          </div>
        </div>
        <div className="relative">
          {series.length >= 2 ? (
            <>
              <Sparkline values={series.map((p) => p.value)} height={220} color="var(--color-mint)" />
              <div className="mt-2 flex">
                {series.map((p, idx) => (
                  <div key={`${p.month}-${idx}`} className="flex-1 text-center font-mono text-[10px] text-faint">{p.month}</div>
                ))}
              </div>
            </>
          ) : (
            <p className="py-12 text-center text-[13px] text-faint">Not enough history to chart yet.</p>
          )}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="px-5 py-5" i={1}>
          <CardHeader eyebrow="Composition" title="Assets" className="mb-4" />
          {assets.length > 0 ? (
            <div className="flex flex-col gap-4">
              {assets.map((a) => (
                <div key={a.id}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span className="text-mute">{a.name}</span>
                    <span className="font-mono tnum text-ink">
                      {fmtUSD(a.balance, true)} <span className="text-faint">({fmtPct(view.totalAssets > 0 ? a.balance / view.totalAssets : 0, 0)})</span>
                    </span>
                  </div>
                  <ProgressBar value={a.balance} max={view.totalAssets} color="var(--color-mint)" />
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-[13px] text-faint">No assets.</p>
          )}
        </Card>

        <Card className="px-5 py-5" i={2}>
          <CardHeader eyebrow="Composition" title="Liabilities" className="mb-4" />
          {liabilities.length > 0 ? (
            <div className="flex flex-col gap-4">
              {liabilities.map((a) => (
                <div key={a.id}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span className="text-mute">{a.name}</span>
                    <span className="font-mono tnum text-ink">
                      {fmtUSD(Math.abs(a.balance), true)} <span className="text-faint">({fmtPct(view.totalLiabilities > 0 ? Math.abs(a.balance) / view.totalLiabilities : 0, 0)})</span>
                    </span>
                  </div>
                  <ProgressBar value={Math.abs(a.balance)} max={view.totalLiabilities} color="var(--color-neg)" />
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-[13px] text-faint">No liabilities — debt-free.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
