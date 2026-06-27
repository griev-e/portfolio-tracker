"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CATEGORIES,
  type Category,
  type Goal,
  SPEND_CATEGORIES,
} from "@/lib/delta/data";
import { useDelta } from "@/lib/delta/store";
import { ActionButton, Field, Modal, Select, TextInput } from "./ui";

const today = () => new Date().toISOString().slice(0, 10);

function Actions({
  onCancel,
  onSubmit,
  submitLabel,
  disabled,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button onClick={onCancel} className="btn-secondary">
        Cancel
      </button>
      <button onClick={onSubmit} disabled={disabled} className="btn-primary disabled:opacity-40">
        {submitLabel}
      </button>
    </div>
  );
}

export function AddTransactionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ledger, addTransaction } = useDelta();
  const accounts = useMemo(() => ledger?.accounts ?? [], [ledger]);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [dir, setDir] = useState<"out" | "in">("out");
  const [category, setCategory] = useState<Category>("Food & Dining");
  const [account, setAccount] = useState("");
  const [date, setDate] = useState(today());

  useEffect(() => {
    if (open && accounts[0] && !accounts.some((a) => a.id === account)) {
      setAccount(accounts[0].id);
    }
  }, [open, accounts, account]);

  const valid = merchant.trim().length > 0 && Number(amount) > 0 && !!account;

  function submit() {
    if (!valid) return;
    const amt = Math.abs(Number(amount));
    addTransaction({
      date,
      merchant: merchant.trim(),
      category: dir === "in" ? (category === "Transfer" ? "Income" : category) : category,
      account,
      amount: dir === "out" ? -amt : amt,
    });
    setMerchant("");
    setAmount("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add transaction">
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-0.5 rounded-lg border border-edge p-0.5">
          {(["out", "in"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDir(d)}
              className={`h-8 rounded-md text-[12.5px] transition-colors ${
                dir === d ? "bg-white/[0.08] text-ink" : "text-faint hover:text-ink"
              }`}
            >
              {d === "out" ? "Expense" : "Income"}
            </button>
          ))}
        </div>
        <Field label="Merchant">
          <TextInput value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Whole Foods" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <TextInput
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
            />
          </Field>
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Account">
            <Select value={account} onChange={(e) => setAccount(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
      <Actions onCancel={onClose} onSubmit={submit} submitLabel="Add" disabled={!valid} />
    </Modal>
  );
}

export function AddBudgetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ledger, addBudget } = useDelta();
  const available = useMemo(() => {
    const used = new Set(ledger?.budgets.map((b) => b.category));
    return SPEND_CATEGORIES.filter((c) => !used.has(c));
  }, [ledger]);
  const [category, setCategory] = useState<Category>(available[0] ?? "Other");
  const [limit, setLimit] = useState("");

  useEffect(() => {
    if (open && available[0] && !available.includes(category)) setCategory(available[0]);
  }, [open, available, category]);

  const valid = available.length > 0 && Number(limit) > 0;

  function submit() {
    if (!valid) return;
    addBudget(category, Math.abs(Number(limit)));
    setLimit("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add budget">
      {available.length === 0 ? (
        <p className="text-[13px] text-mute">Every category already has a budget.</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {available.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Monthly limit">
            <TextInput
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="500"
              autoFocus
            />
          </Field>
        </div>
      )}
      <Actions onCancel={onClose} onSubmit={submit} submitLabel="Add budget" disabled={!valid} />
    </Modal>
  );
}

export function AddGoalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addGoal } = useDelta();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [monthly, setMonthly] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const valid = name.trim().length > 0 && Number(target) > 0;

  function submit() {
    if (!valid) return;
    addGoal({
      name: name.trim(),
      target: Math.abs(Number(target)),
      saved: 0,
      monthly: Math.abs(Number(monthly) || 0),
      targetDate: targetDate || today(),
    });
    setName("");
    setTarget("");
    setMonthly("");
    setTargetDate("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="New goal">
      <div className="flex flex-col gap-3.5">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target amount">
            <TextInput inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="10000" />
          </Field>
          <Field label="Monthly">
            <TextInput inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="500" />
          </Field>
        </div>
        <Field label="Target date">
          <TextInput type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </Field>
      </div>
      <Actions onCancel={onClose} onSubmit={submit} submitLabel="Create goal" disabled={!valid} />
    </Modal>
  );
}

export function ContributeModal({
  goal,
  onClose,
}: {
  goal: Goal | null;
  onClose: () => void;
}) {
  const { contributeToGoal } = useDelta();
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (goal) setAmount("");
  }, [goal]);

  const valid = Number(amount) > 0;

  function submit() {
    if (!goal || !valid) return;
    contributeToGoal(goal.id, Math.abs(Number(amount)));
    onClose();
  }

  return (
    <Modal open={!!goal} onClose={onClose} title={goal ? `Add to ${goal.name}` : ""}>
      <Field label="Contribution">
        <TextInput
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="500"
          autoFocus
        />
      </Field>
      <Actions onCancel={onClose} onSubmit={submit} submitLabel="Add funds" disabled={!valid} />
    </Modal>
  );
}

/** Convenience: a header "Add" button that opens the transaction modal. */
export function AddTransactionButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ActionButton onClick={() => setOpen(true)} variant="primary">
        + Add
      </ActionButton>
      <AddTransactionModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
