"use client";

import { Sparkline } from "@/components/charts/Sparkline";
import { EditableMoney } from "@/components/delta/EditableMoney";
import { DeltaEmpty, IconButton, TrashIcon } from "@/components/delta/ui";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { ACCOUNT_KIND_LABEL, type Account } from "@/lib/delta/data";
import { ledgerHasData, useDelta } from "@/lib/delta/store";
import { fmtUSDCompact } from "@/lib/format";

export default function AccountsPage() {
  const { ready, ledger, view, updateAccountBalance, removeAccount } = useDelta();

  if (!ready) return null;
  if (!ledger || !view || !ledgerHasData(ledger)) return <DeltaEmpty page="Accounts" />;

  const accounts = ledger.accounts;
  const assets = accounts.filter((a) => a.balance >= 0);
  const liabilities = accounts.filter((a) => a.balance < 0);

  return (
    <div>
      <PageHeader
        eyebrow="Money"
        title="Accounts"
        description={`${accounts.length} accounts · click any balance to edit it`}
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Card className="px-5 py-4" i={0} hover={false}>
          <Stat label="Assets" value={view.totalAssets} format={fmtUSDCompact} size="sm" toneClass="text-pos" />
        </Card>
        <Card className="px-5 py-4" i={1} hover={false}>
          <Stat label="Liabilities" value={view.totalLiabilities} format={fmtUSDCompact} size="sm" toneClass="text-neg" />
        </Card>
        <Card className="px-5 py-4" i={2} hover={false}>
          <Stat label="Net worth" value={view.netWorth} format={fmtUSDCompact} size="sm" />
        </Card>
      </div>

      {assets.length > 0 && (
        <Card className="mb-5 px-5 py-5" i={3}>
          <CardHeader eyebrow="Assets" title="What you own" className="mb-4" />
          <div className="flex flex-col divide-y divide-edge/60">
            {assets.map((a) => (
              <AccountRow key={a.id} a={a} onEdit={updateAccountBalance} onRemove={removeAccount} />
            ))}
          </div>
        </Card>
      )}

      {liabilities.length > 0 && (
        <Card className="px-5 py-5" i={4}>
          <CardHeader eyebrow="Liabilities" title="What you owe" className="mb-4" />
          <div className="flex flex-col divide-y divide-edge/60">
            {liabilities.map((a) => (
              <AccountRow key={a.id} a={a} onEdit={updateAccountBalance} onRemove={removeAccount} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function AccountRow({
  a,
  onEdit,
  onRemove,
}: {
  a: Account;
  onEdit: (id: string, balance: number) => void;
  onRemove: (id: string) => void;
}) {
  const liability = a.balance < 0;
  const color = liability ? "var(--color-neg)" : "var(--color-mint)";
  return (
    <div className="group flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-[13px] font-medium"
          style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
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

      <div className="flex items-center gap-1 text-right text-[14px] text-ink">
        <EditableMoney value={a.balance} onCommit={(v) => onEdit(a.id, v)} allowNegative whole={false} />
        <span className="opacity-0 transition-opacity group-hover:opacity-100">
          <IconButton label="Remove account" danger onClick={() => onRemove(a.id)}>
            <TrashIcon />
          </IconButton>
        </span>
      </div>
    </div>
  );
}
