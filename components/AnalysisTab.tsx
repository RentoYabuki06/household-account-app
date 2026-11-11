"use client";

import { useMemo } from "react";
import { colorOf, UNCATEGORIZED } from "@/lib/categories";
import { yen } from "@/lib/format";
import type { Expense } from "@/lib/supabase";

type Props = {
  expenses: Pick<Expense, "amount" | "category">[];
  prevExpenses: Pick<Expense, "amount" | "category">[];
};

const sumByCategory = (rows: Props["expenses"]) => {
  const m = new Map<string, number>();
  for (const r of rows) {
    const c = r.category || UNCATEGORIZED;
    m.set(c, (m.get(c) ?? 0) + r.amount);
  }
  return m;
};

export default function AnalysisTab({ expenses, prevExpenses }: Props) {
  const { rows, total, prevTotal } = useMemo(() => {
    const cur = sumByCategory(expenses);
    const prev = sumByCategory(prevExpenses);
    const rows = [...cur.entries()]
      .map(([category, amount]) => ({ category, amount, prev: prev.get(category) ?? 0 }))
      .sort((a, b) => b.amount - a.amount);
    return {
      rows,
      total: expenses.reduce((s, e) => s + e.amount, 0),
      prevTotal: prevExpenses.reduce((s, e) => s + e.amount, 0),
    };
  }, [expenses, prevExpenses]);

  // 構成比は、プラスの支出だけで計算する（返品などのマイナスは除く）
  const positiveSum = rows.reduce((s, r) => s + Math.max(r.amount, 0), 0);
  const uncategorized = rows.find((r) => r.category === UNCATEGORIZED)?.amount ?? 0;
  const diff = total - prevTotal;

  if (expenses.length === 0) {
    return <p className="p-4 text-center text-sm text-slate-400">この月の支出はありません</p>;
  }

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
          <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
            {rows
              .filter((r) => r.amount > 0)
              .map((r) => (
                <div
                  key={r.category}
                  title={r.category}
                  style={{ width: `${(r.amount / positiveSum) * 100}%`, background: colorOf(r.category) }}
                />
              ))}
          </div>
        )}

        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.category}>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: colorOf(r.category) }}
                />
                <span className="flex-1 truncate">{r.category}</span>
                {r.amount > 0 && positiveSum > 0 && (
                  <span className="text-xs text-slate-400">
                    {Math.round((r.amount / positiveSum) * 100)}%
                  </span>
                )}
                <span className="w-24 text-right font-semibold">{yen(r.amount)}</span>
              </div>
              <p className="pl-[18px] text-xs text-slate-400">前月 {yen(r.prev)}</p>
            </li>
          ))}
        </ul>
      </section>

      {uncategorized > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
          未分類が {yen(uncategorized)} あります。履歴タブで店名の右のカテゴリを選ぶと分類できます。
          同じ店名のカード利用は、まとめて同じカテゴリになります。
        </p>
      )}
    </div>
  );
}
