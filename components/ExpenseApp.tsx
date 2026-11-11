"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Wallet } from "lucide-react";
import { supabase, type Expense, type PaymentMethod } from "@/lib/supabase";

const METHODS: PaymentMethod[] = ["PayPay", "現金", "その他"];
const CATEGORIES = ["食費", "日用品", "交通費", "趣味", "固定費", "その他"];

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function ExpenseApp() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [store, setStore] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("PayPay");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [submitting, setSubmitting] = useState(false);

  const fetchExpenses = useCallback(async () => {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("used_at", { ascending: false })
      .limit(100);
    if (error) setError(error.message);
    else {
      setError(null);
      setExpenses(data as Expense[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const monthTotal = useMemo(() => {
    const now = new Date();
    return expenses
      .filter((e) => {
        const d = new Date(e.used_at);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const add = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const n = parseInt(amount, 10);
    if (!n || n <= 0) return;
    setSubmitting(true);
    const { error } = await supabase.from("expenses").insert({
      used_at: new Date().toISOString(),
      store: store.trim() || category,
      amount: n,
      category,
      payment_method: method,
      source: "manual",
    });
    setSubmitting(false);
    if (error) return setError(error.message);
    setAmount("");
    setStore("");
    await fetchExpenses();
  };

  const remove = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return setError(error.message);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <main className="mx-auto max-w-md pb-[env(safe-area-inset-bottom)]">
      {/* Header */}
      <header className="bg-emerald-600 px-5 pb-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] text-white">
        <p className="flex items-center gap-1.5 text-sm opacity-90">
          <Wallet size={16} /> {new Date().getMonth() + 1}月の支出
        </p>
        <p className="mt-1 text-4xl font-bold tracking-tight">{yen(monthTotal)}</p>
      </header>

      <div className="space-y-5 p-4">
        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>
        )}

        {/* Quick Input Form */}
        <form onSubmit={add} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="金額"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-lg outline-none focus:border-emerald-500"
          />
          <input
            type="text"
            placeholder="店舗 / メモ"
            value={store}
            onChange={(e) => setStore(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500"
          />
          <div className="flex gap-2">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                  method === m ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500"
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-3 font-semibold text-white active:bg-emerald-700 disabled:opacity-50"
          >
            <Plus size={18} /> 追加
          </button>
        </form>

        {/* Expense List */}
        <section>
          <h2 className="mb-2 px-1 text-sm font-semibold text-slate-500">履歴</h2>
          {loading ? (
            <p className="p-4 text-center text-sm text-slate-400">読み込み中…</p>
          ) : expenses.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">まだ支出がありません</p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm">
              {expenses.map((e) => {
                const auto = e.source === "auto";
                return (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            auto ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {auto ? "自動" : "手入力"}
                        </span>
                        <span className="truncate font-medium">{e.store}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {fmtDate(e.used_at)} ・ {e.payment_method}
                        {e.category && e.category !== "未分類" ? ` ・ ${e.category}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold">{yen(e.amount)}</span>
                    <button
                      onClick={() => remove(e.id)}
                      aria-label="削除"
                      className="shrink-0 p-1.5 text-slate-300 active:text-red-500"
                    >
                      <Trash2 size={18} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
