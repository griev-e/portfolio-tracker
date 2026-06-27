"use client";

import { useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { parseTransactionsCSV, SAMPLE_CSV_TEXT } from "@/lib/theta/csv";
import { useTheta } from "@/lib/theta/store";

export default function ThetaImportPage() {
  const { ready, ledger, isSample, importTransactions, loadSample, clear } = useTheta();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!ready) return null;
  const accounts = ledger?.accounts ?? [];

  function doImport(raw: string) {
    const { transactions, skipped } = parseTransactionsCSV(raw, accounts);
    if (transactions.length === 0) {
      setMsg({ tone: "err", text: "No valid rows found. Check the date and amount columns." });
      return;
    }
    importTransactions(transactions);
    setText("");
    setMsg({
      tone: "ok",
      text: `Imported ${transactions.length} transaction${transactions.length === 1 ? "" : "s"}${
        skipped ? ` · skipped ${skipped} unparseable row${skipped === 1 ? "" : "s"}` : ""
      }.`,
    });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => doImport(String(reader.result ?? ""));
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Import & Data"
        description="Bring in your own transactions, or manage the sample ledger."
      />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="px-5 py-5" i={0}>
          <CardHeader eyebrow="Transactions" title="Import a CSV" className="mb-4" />
          <p className="mb-3 text-[13px] leading-relaxed text-mute">
            Paste or upload a CSV. Columns are matched by name in any order —
            <span className="font-mono text-[12px] text-faint"> date, merchant, amount, category, account</span>.
            Negative amounts (or parenthesized) are money out. Importing replaces
            your current transactions.
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={SAMPLE_CSV_TEXT}
            className="h-44 w-full resize-none rounded-lg border border-edge2 bg-panel p-3 font-mono text-[12px] text-ink placeholder:text-faint/60 outline-none transition-colors focus:border-white/30"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <button onClick={() => doImport(text)} disabled={!text.trim()} className="btn-primary disabled:opacity-40">
              Import pasted
            </button>
            <button onClick={() => fileRef.current?.click()} className="btn-secondary">
              Upload file…
            </button>
            <button onClick={() => setText(SAMPLE_CSV_TEXT)} className="text-[12px] text-faint transition-colors hover:text-ink">
              Use example
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="hidden" />
          </div>

          {msg && (
            <div className={`mt-3 rounded-md border px-3 py-2 text-[12.5px] ${
              msg.tone === "ok" ? "border-pos/30 bg-pos/10 text-pos" : "border-neg/30 bg-neg/10 text-neg"
            }`}>
              {msg.text}
            </div>
          )}
        </Card>

        <Card className="px-5 py-5" i={1}>
          <CardHeader eyebrow="Ledger" title="Your data" className="mb-4" />
          <div className="flex flex-col divide-y divide-edge/60 text-[13px]">
            <Stat2 label="Accounts" value={accounts.length} />
            <Stat2 label="Transactions" value={ledger?.transactions.length ?? 0} />
            <Stat2 label="Budgets" value={ledger?.budgets.length ?? 0} />
            <Stat2 label="Goals" value={ledger?.goals.length ?? 0} />
            <Stat2 label="Recurring" value={ledger?.recurring.length ?? 0} />
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <button onClick={() => { loadSample(); setMsg({ tone: "ok", text: "Sample ledger loaded." }); }} className="btn-secondary w-full">
              Load sample ledger
            </button>
            <button
              onClick={() => { clear(); setMsg({ tone: "ok", text: "Ledger cleared." }); }}
              className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-neg/30 text-[13px] font-medium text-neg/90 transition-colors hover:bg-neg/10"
            >
              Clear all data
            </button>
          </div>

          <p className="mt-4 text-[11.5px] leading-relaxed text-faint">
            {isSample ? "Currently showing sample data. " : ""}
            Everything is stored in this browser only — nothing leaves your device.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Stat2({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
      <span className="text-mute">{label}</span>
      <span className="font-mono tnum text-ink">{value}</span>
    </div>
  );
}
