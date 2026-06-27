"use client";

import { Sparkline } from "@/components/charts/Sparkline";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import {
  ACCOUNT_KIND_LABEL,
  type Account,
  ACCOUNTS,
  netWorth,
  totalAssets,
  totalLiabilities,
} from "@/lib/delta/data";
import { fmtUSD, fmtUSDCompact } from "@/lib/format";

export default function AccountsPage() {
  const assets = ACCOUNTS.filter((a) => a.balance >= 0);
  const liabilities = ACCOUNTS.filter((a) => a.balance < 0);

  return (
    <div>
      <PageHeader
        eyebrow="Money"
        title="Accounts"
        description={`${ACCOUNTS.length} linked accounts · balances updated moments ago`}
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Card className="px-5 py-4" i={0} hover={false}>
          <Stat label="Assets" value={totalAssets} format={fmtUSDCompact} size="sm" toneClass="text-pos" />
        </Card>
        <Card className="px-5 py-4" i={1} hover={false}>
          <Stat label="Liabilities" value={totalLiabilities} format={fmtUSDCompact} size="sm" toneClass="text-neg" />
        </Card>
        <Card className="px-5 py-4" i={2} hover={false}>
          <Stat label="Net worth" value={netWorth} format={fmtUSDCompact} size="sm" />
        </Card>
      </div>

      <Card className="mb-5 px-5 py-5" i={3}>
        <CardHeader eyebrow="Assets" title="What you own" className="mb-4" />
        <div className="flex flex-col divide-y divide-edge/60">
          {assets.map((a) => (
            <AccountRow key={a.id} a={a} />
          ))}
        </div>
      </Card>

      <Card className="px-5 py-5" i={4}>
        <CardHeader eyebrow="Liabilities" title="What you owe" className="mb-4" />
        <div className="flex flex-col divide-y divide-edge/60">
          {liabilities.map((a) => (
            <AccountRow key={a.id} a={a} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function AccountRow({ a }: { a: Account }) {
  const liability = a.balance < 0;
  const color = liability ? "var(--color-neg)" : "var(--color-mint)";
  return (
    <div className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-[13px] font-medium"
          style={{
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
            color,
          }}
        >
          {a.institution.charAt(0)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-ink">{a.name}</div>
          <div className="text-[11px] text-faint">
            {a.institution} · {ACCOUNT_KIND_LABEL[a.kind]} ···· {a.mask}
          </div>
        </div>
      </div>

      <div className="hidden w-28 sm:block">
        <Sparkline values={a.trend} height={34} color={color} />
      </div>

      <div className="w-28 text-right font-mono tnum text-[14px] text-ink">
        {liability ? `−${fmtUSD(Math.abs(a.balance))}` : fmtUSD(a.balance)}
      </div>
    </div>
  );
}
