"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { UNCATEGORIZED } from "@/lib/categories";
import { yen } from "@/lib/format";
import type { Expense } from "@/lib/supabase";

type Props = {
  expenses: Expense[];
  month: Date;
  colorOf: (category: string) => string;
};

const catOf = (e: Pick<Expense, "category">) => e.category || UNCATEGORIZED;

const sumByCategory = (rows: Pick<Expense, "amount" | "category">[]) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(catOf(r), (m.get(catOf(r)) ?? 0) + r.amount);
  return m;
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// カレンダーのマスに入れる短い金額表記（¥1,234 → 1,234、1万以上は 1.2万）
const compactYen = (n: number) => {
  const a = Math.abs(n);
  const body = a >= 10000 ? `${Math.round(a / 1000) / 10}万` : a.toLocaleString("ja-JP");
  return n < 0 ? `-${body}` : body;
};

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// 円グラフ（ドーナツ）: pathLength=100 を指定するので、割合をそのまま dasharray に使える
const R = 13.5; // リングの中心線の半径（viewBox は 36 四方、中心は 18,18）
const STROKE = 8; // リングの太さ
const LABEL_SIZE = 2.6; // 区画に入れるカテゴリ名の文字サイズ
const CIRCUMFERENCE = 2 * Math.PI * R;

// 区画の弧の長さに収まる文字数にカテゴリ名を切り詰める。2 文字に満たない小さな区画は名前を出さない
const labelFor = (name: string, pct: number) => {
  const fit = Math.floor(((pct / 100) * CIRCUMFERENCE) / LABEL_SIZE);
  if (fit < 2) return null;
  return name.length <= fit ? name : name.slice(0, fit - 1) + "…";
};

export default function AnalysisTab({ expenses, month, colorOf }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  // 日ごとの合計（月の 1 日が何曜日か、何日まであるかも一緒に求める）
  const calendar = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    const offset = new Date(y, m, 1).getDay();
    const daily = new Map<number, number>();
    for (const e of expenses) {
      const d = new Date(e.used_at).getDate();
      daily.set(d, (daily.get(d) ?? 0) + e.amount);
    }
    const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
    while (cells.length % 7 !== 0) cells.push(null);
    const max = Math.max(0, ...[...daily.values()]);
    return { cells, daily, max };
  }, [expenses, month]);

  const { rows, total, byCategory } = useMemo(() => {
    const cur = sumByCategory(expenses);
    const rows = [...cur.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount); // 金額の多い順
    const byCategory = new Map<string, Expense[]>();
    for (const e of expenses) {
      const c = catOf(e);
      byCategory.set(c, [...(byCategory.get(c) ?? []), e]);
    }
    return {
      rows,
      total: expenses.reduce((s, e) => s + e.amount, 0),
      byCategory,
    };
  }, [expenses]);

  // 構成比は、プラスの支出だけで計算する（返品などのマイナスは除く）
  const positive = rows.filter((r) => r.amount > 0);
  const positiveSum = positive.reduce((s, r) => s + r.amount, 0);
  const uncategorized = rows.find((r) => r.category === UNCATEGORIZED)?.amount ?? 0;

  const toggle = (category: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  let cumulative = 0;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-3 shadow-sm">
        <h2 className="mb-2 px-1 text-sm font-semibold text-slate-500">日別の支出</h2>
        <div className="grid grid-cols-7 gap-px text-center text-[10px] text-slate-400">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={i === 0 ? "text-red-400" : i === 6 ? "text-sky-500" : ""}>
              {w}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {calendar.cells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const amt = calendar.daily.get(d);
            const alpha = amt && amt > 0 && calendar.max > 0 ? 0.08 + 0.32 * (amt / calendar.max) : 0; // 支出が多い日ほど濃く
            return (
              <div
                key={i}
                className="flex h-12 flex-col items-center rounded-md bg-slate-50 py-1"
                style={alpha ? { background: `rgba(239, 68, 68, ${alpha})` } : undefined}
              >
                <span className="text-[10px] leading-none text-slate-500">{d}</span>
                {amt !== undefined && (
                  <span
                    className={`mt-1 text-[10px] font-semibold leading-none ${amt < 0 ? "text-emerald-600" : "text-slate-700"}`}
                  >
                    {compactYen(amt)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {expenses.length === 0 && (
        <p className="p-4 text-center text-sm text-slate-400">この月の支出はありません</p>
      )}

      {expenses.length > 0 && (
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">カテゴリ別</h2>

        {positiveSum > 0 && (
          <div className="relative mx-auto mb-5 h-60 w-60">
            <svg viewBox="0 0 36 36" className="h-full w-full" role="img" aria-label="カテゴリ別の円グラフ">
              <circle cx="18" cy="18" r={R} fill="none" stroke="#f1f5f9" strokeWidth={STROKE} />
              {positive.map((r) => {
                const pct = (r.amount / positiveSum) * 100;
                const seg = positive.length > 1 ? Math.max(pct - 0.6, 0) : pct; // 区切りの隙間
                const dim = open.size > 0 && !open.has(r.category);
                const angle = ((cumulative + pct / 2) / 100) * 360; // 12 時から時計回りの角度
                const rad = (angle * Math.PI) / 180;
                const x = 18 + R * Math.sin(rad);
                const y = 18 - R * Math.cos(rad);
                const rotate = angle > 90 && angle < 270 ? angle - 180 : angle; // 下半分は文字が逆さにならないよう反転
                const label = labelFor(r.category, pct);
                const el = (
                  <g key={r.category} opacity={dim ? 0.35 : 1} style={{ transition: "opacity 0.2s" }}>
                    <circle
                      cx="18"
                      cy="18"
                      r={R}
                      fill="none"
                      stroke={colorOf(r.category)}
                      strokeWidth={open.has(r.category) ? STROKE + 1 : STROKE}
                      pathLength={100}
                      strokeDasharray={`${seg} ${100 - seg}`}
                      strokeDashoffset={25 - cumulative} // 12 時の位置から時計回り
                    />
                    {label && (
                      <text
                        x={x}
                        y={y}
                        transform={`rotate(${rotate} ${x} ${y})`}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={LABEL_SIZE}
                        fontWeight={600}
                        fill="#ffffff"
                        fillOpacity={0.8}
                        pointerEvents="none"
                      >
                        {label}
                      </text>
                    )}
                  </g>
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
                      {items.length}件
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
      )}

      {uncategorized > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
          未分類が {yen(uncategorized)} あります。「未分類」を開いて明細を確認し、履歴タブで店名の右のカテゴリを選ぶと分類できます。
          同じ店名のカード利用は、まとめて同じカテゴリになります。
        </p>
      )}
    </div>
  );
}
