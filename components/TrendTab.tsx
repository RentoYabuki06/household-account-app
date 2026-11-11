"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { UNCATEGORIZED } from "@/lib/categories";
import { yen } from "@/lib/format";

type Row = { id: string; amount: number; category: string | null; used_at: string };

type Props = {
  colorOf: (category: string) => string;
  categoryNames: string[];
};

const FETCH_MONTHS = 12; // 取得する月数（今月を含む）
const CHART_HEIGHT = 140;
const TOTAL = "__total__";

const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
const compact = (n: number) =>
  Math.abs(n) >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, "")}万` : String(n);

// 1000 件ずつ、全件を取得する
async function fetchRows(from: Date): Promise<{ rows: Row[]; error: string | null }> {
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let i = 0; ; i += PAGE) {
    const { data, error } = await supabase
      .from("expenses")
      .select("id,amount,category,used_at")
      .gte("used_at", from.toISOString())
      .order("used_at")
      .order("id")
      .range(i, i + PAGE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...(data as Row[]));
    if (data.length < PAGE) break;
  }
  return { rows, error: null };
}

export default function TrendTab({ colorOf, categoryNames }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<6 | 12>(6);
  const [series, setSeries] = useState<string>(TOTAL);

  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - (FETCH_MONTHS - 1), 1);
    fetchRows(from).then(({ rows, error }) => {
      setRows(rows);
      setError(error);
      setLoading(false);
    });
  }, []);

  // 月 × カテゴリの集計（取得した 12 か月ぶんを一度だけ計算し、表示の切り替えでは再取得しない）
  const { months, cells, seriesNames } = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: FETCH_MONTHS }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (FETCH_MONTHS - 1 - i), 1);
      return { date: d, key: keyOf(d) };
    });
    const cells = new Map<string, Map<string, number>>(months.map((m) => [m.key, new Map()]));
    const found = new Set<string>();
    for (const r of rows) {
      const cell = cells.get(keyOf(new Date(r.used_at)));
      if (!cell) continue;
      const c = r.category || UNCATEGORIZED;
      found.add(c);
      cell.set(c, (cell.get(c) ?? 0) + r.amount);
    }
    // カテゴリ一覧の順 → 一覧にない過去のカテゴリ → 未分類
    const known = categoryNames.filter((n) => found.has(n));
    const others = [...found].filter((n) => !categoryNames.includes(n) && n !== UNCATEGORIZED);
    const seriesNames = [...known, ...others, ...(found.has(UNCATEGORIZED) ? [UNCATEGORIZED] : [])];
    return { months, cells, seriesNames };
  }, [rows, categoryNames]);

  const valueOf = (monthKey: string, name: string) =>
    name === TOTAL
      ? [...(cells.get(monthKey)?.values() ?? [])].reduce((s, v) => s + v, 0)
      : cells.get(monthKey)?.get(name) ?? 0;

  const shown = months.slice(FETCH_MONTHS - range);
  const values = shown.map((m) => valueOf(m.key, series));
  const isTotal = series === TOTAL;

  // 棒の高さの基準: 合計の表示ではプラスの支出の積み上げ、カテゴリの表示ではその値
  const scaleMax = Math.max(
    1,
    ...shown.map((m) =>
      isTotal
        ? seriesNames.reduce((s, n) => s + Math.max(valueOf(m.key, n), 0), 0)
        : Math.max(valueOf(m.key, series), 0)
    )
  );
  const px = (v: number) => (Math.max(v, 0) / scaleMax) * CHART_HEIGHT;

  const sum = values.reduce((s, v) => s + v, 0);
  const average = Math.round(sum / shown.length);

  const prevOf = (i: number) => {
    const idx = FETCH_MONTHS - range + i - 1;
    return idx >= 0 ? valueOf(months[idx].key, series) : null;
  };

  if (loading) return <p className="p-4 text-center text-sm text-slate-400">読み込み中…</p>;
  if (error) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>;

  const accent = isTotal ? "#059669" : colorOf(series);

  return (
    <div className="space-y-4">
      {/* 切り替え: 合計 / カテゴリ */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[TOTAL, ...seriesNames].map((n) => {
          const active = series === n;
          const color = n === TOTAL ? "#059669" : colorOf(n);
          return (
            <button
              key={n}
              onClick={() => setSeries(n)}
              style={active ? { background: color, borderColor: color } : { borderColor: color, color }}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
                active ? "text-white" : "bg-white"
              }`}
            >
              {n === TOTAL ? "合計" : n}
            </button>
          );
        })}
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500">
            {isTotal ? "月ごとの合計" : `${series}の推移`}
          </h2>
          <div className="flex overflow-hidden rounded-lg border border-slate-200 text-xs">
            {([6, 12] as const).map((n) => (
              <button
                key={n}
                onClick={() => setRange(n)}
                className={`px-2.5 py-1 ${range === n ? "bg-slate-800 text-white" : "text-slate-500"}`}
              >
                {n}か月
              </button>
            ))}
          </div>
        </div>

        {/* 棒グラフ */}
        <div className="flex items-end gap-1" style={{ height: CHART_HEIGHT + 20 }}>
          {shown.map((m, i) => (
            <div key={m.key} className="flex min-w-0 flex-1 flex-col items-center justify-end">
              <span className="mb-0.5 text-[10px] leading-none text-slate-500">{compact(values[i])}</span>
              <div className="flex w-full flex-col-reverse overflow-hidden rounded-t">
                {isTotal ? (
                  seriesNames.map((n) => (
                    <div
                      key={n}
                      title={n}
                      style={{ height: px(valueOf(m.key, n)), background: colorOf(n) }}
                    />
                  ))
                ) : (
                  <div style={{ height: px(values[i]), background: accent }} />
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-1 border-t border-slate-200 pt-1">
          {shown.map((m) => (
            <span key={m.key} className="min-w-0 flex-1 text-center text-[10px] text-slate-400">
              {m.date.getMonth() + 1}月
            </span>
          ))}
        </div>

        {/* 凡例（合計の表示のときのみ） */}
        {isTotal && (
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {seriesNames.map((n) => (
              <span key={n} className="flex items-center gap-1 text-[11px] text-slate-500">
                <span className="h-2 w-2 rounded-full" style={{ background: colorOf(n) }} />
                {n}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-3 shadow-sm">
          <p className="text-xs text-slate-500">{range}か月の合計</p>
          <p className="mt-0.5 text-lg font-bold">{yen(sum)}</p>
        </div>
        <div className="rounded-2xl bg-white p-3 shadow-sm">
          <p className="text-xs text-slate-500">月平均</p>
          <p className="mt-0.5 text-lg font-bold">{yen(average)}</p>
        </div>
      </section>

      {/* 数値の一覧（新しい月から） */}
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm">
        {[...shown].reverse().map((m, ri) => {
          const i = shown.length - 1 - ri;
          const prev = prevOf(i);
          const diff = prev === null ? null : values[i] - prev;
          return (
            <li key={m.key} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>
                {m.date.getFullYear()}年{m.date.getMonth() + 1}月
              </span>
              <span className="flex items-center gap-3">
                <span
                  className={`w-24 text-right text-xs ${
                    diff === null || diff === 0
                      ? "text-slate-300"
                      : diff > 0
                      ? "text-red-500"
                      : "text-emerald-600"
                  }`}
                >
                  {diff === null ? "—" : `${diff > 0 ? "+" : diff < 0 ? "-" : ""}${yen(Math.abs(diff))}`}
                </span>
                <span className="w-24 text-right font-semibold">{yen(values[i])}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
