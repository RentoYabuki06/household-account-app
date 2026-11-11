"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { UNCATEGORIZED } from "@/lib/categories";
import { yen } from "@/lib/format";
import type { Expense } from "@/lib/supabase";

type Props = {
  expenses: Expense[];
  prevExpenses: Pick<Expense, "amount" | "category">[];
  colorOf: (category: string) => string;
};

const catOf = (e: Pick<Expense, "category">) => e.category || UNCATEGORIZED;

const sumByCategory = (rows: Pick<Expense, "amount" | "category">[]) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(catOf(r), (m.get(catOf(r)) ?? 0) + r.amount);
  return m;
};

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// 円グラフ（ドーナツ）: 半径 15.9155 の円の円周が 100 になるので、割合をそのまま dasharray に使える
const R = 15.9155;

export default function AnalysisTab({ expenses, prevExpenses, colorOf }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  const { rows, total, prevTotal, byCategory } = useMemo(() => {
    const cur = sumByCategory(expenses);
    const prev = sumByCategory(prevExpenses);
    const rows = [...cur.entries()]
      .map(([category, amount]) => ({ category, amount, prev: prev.get(category) ?? 0 }))
      .sort((a, b) => b.amount - a.amount); // 金額の多い順
    const byCategory = new Map<string, Expense[]>();
    for (const e of expenses) {
      const c = catOf(e);
      byCategory.set(c, [...(byCategory.get(c) ?? []), e]);
    }
    return {
      rows,
      total: expenses.reduce((s, e) => s + e.amount, 0),
      prevTotal: prevExpenses.reduce((s, e) => s + e.amount, 0),
      byCategory,
    };
  }, [expenses, prevExpenses]);

  // 構成比は、プラスの支出だけで計算する（返品などのマイナスは除く）
  const positive = rows.filter((r) => r.amount > 0);
  const positiveSum = positive.reduce((s, r) => s + r.amount, 0);
  const uncategorized = rows.find((r) => r.category === UNCATEGORIZED)?.amount ?? 0;
  const diff = total - prevTotal;

  const toggle = (category: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  if (expenses.length === 0) {
    return <p className="p-4 text-center text-sm text-slate-400">この月の支出はありません</p>;
  }

  let cumulative = 0;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-xs text-slate-500">前月との比較</p>
        <p className="mt-1 text-sm">
          前月 {yen(prevTotal)} →{" "}
          <span className={diff > 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-600"}>
            {diff > 0 ? "+" : diff < 0 ? "-" : ""}
            {yen(Math.abs(diff))}
          </span>
        </p>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">カテゴリ別</h2>

        {positiveSum > 0 && (
          <div className="relative mx-auto mb-5 h-52 w-52">
            <svg viewBox="0 0 36 36" className="h-full w-full" role="img" aria-label="カテゴリ別の円グラフ">
              <circle cx="18" cy="18" r={R} fill="none" stroke="#f1f5f9" strokeWidth="4" />
              {positive.map((r) => {
                const pct = (r.amount / positiveSum) * 100;
                const seg = positive.length > 1 ? Math.max(pct - 0.5, 0) : pct; // 区切りの隙間
                const el = (
                  <circle
                    key={r.category}
                    cx="18"
                    cy="18"
                    r={R}
                    fill="none"
                    stroke={colorOf(r.category)}
                    strokeWidth={open.has(r.category) ? 5 : 4}
                    strokeDasharray={`${seg} ${100 - seg}`}
                    strokeDashoffset={25 - cumulative} // 12 時の位置から時計回り
                    opacity={open.size === 0 || open.has(r.category) ? 1 : 0.35}
                    style={{ transition: "opacity 0.2s, stroke-width 0.2s" }}
                  />
                );
                cumulative += pct;
                return el;
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs text-slate-400">合計</span>
              <span className="text-xl font-bold">{yen(total)}</span>
            </div>
          </div>
        )}

        <ul className="divide-y divide-slate-100">
          {rows.map((r) => {
            const isOpen = open.has(r.category);
            const items = [...(byCategory.get(r.category) ?? [])].sort((a, b) =>
              b.used_at.localeCompare(a.used_at)
            );
            return (
              <li key={r.category}>
                <button
                  onClick={() => toggle(r.category)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 py-3 text-left active:bg-slate-50"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(r.category) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{r.category}</span>
                    <span className="block text-xs text-slate-400">
                      {items.length}件 ・ 前月 {yen(r.prev)}
                    </span>
                  </span>
                  {r.amount > 0 && positiveSum > 0 && (
                    <span className="text-xs text-slate-400">{Math.round((r.amount / positiveSum) * 100)}%</span>
                  )}
                  <span className="w-24 text-right text-sm font-semibold">{yen(r.amount)}</span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-slate-300 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen && (
                  <ul className="mb-3 ml-[18px] space-y-1.5 border-l-2 pl-3" style={{ borderColor: colorOf(r.category) }}>
                    {items.map((e) => (
                      <li key={e.id} className="flex items-baseline gap-2 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{e.store}</span>
                          <span className="block text-xs text-slate-400">
                            {fmtShort(e.used_at)} ・ {e.payment_method}
                          </span>
                        </span>
                        <span className="shrink-0 font-medium">{yen(e.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {uncategorized > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
          未分類が {yen(uncategorized)} あります。「未分類」を開いて明細を確認し、履歴タブで店名の右のカテゴリを選ぶと分類できます。
          同じ店名のカード利用は、まとめて同じカテゴリになります。
        </p>
      )}
    </div>
  );
}
