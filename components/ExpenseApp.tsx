"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, Wallet } from "lucide-react";
import { supabase, type Expense, type PaymentMethod } from "@/lib/supabase";
import {
  DEFAULT_CATEGORIES,
  UNCATEGORIZED,
  makeColorOf,
  pickNewColor,
  type Category,
} from "@/lib/categories";
import { yen } from "@/lib/format";
import AnalysisTab from "@/components/AnalysisTab";
import TrendTab from "@/components/TrendTab";
import ReceiptScanner, { type ReceiptResult } from "@/components/ReceiptScanner";

const METHODS: PaymentMethod[] = ["PayPay", "現金", "その他"];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

type Tab = "history" | "analysis" | "trend";
const TAB_ORDER: Tab[] = ["history", "analysis", "trend"];

// スワイプとみなす条件: 横に 60px 以上、かつ縦の動きの 1.5 倍以上
const SWIPE_MIN_X = 60;
const SWIPE_RATIO = 1.5;
// 画面の端（ブラウザの「戻る」ジェスチャーと競合する範囲）から始まった操作は無視する
const EDGE_GUARD = 24;

const pad2 = (n: number) => String(n).padStart(2, "0");
// 端末の時刻（日本時間）での YYYY-MM-DD
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// 入力された日付（と時刻）から used_at を作る。今日なら現在時刻、過去の日付で時刻がなければ 12:00
const toUsedAt = (dateStr: string, timeStr: string | null) => {
  if (timeStr) return new Date(`${dateStr}T${timeStr}:00`).toISOString();
  if (dateStr === toDateStr(new Date())) return new Date().toISOString();
  return new Date(`${dateStr}T12:00:00`).toISOString();
};

const monthStart = (d: Date, offset = 0) => new Date(d.getFullYear(), d.getMonth() + offset, 1);

export default function ExpenseApp() {
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [tab, setTab] = useState<Tab>("history");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [sortKey, setSortKey] = useState<"date-desc" | "date-asc" | "amount-desc" | "amount-asc">("date-desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [store, setStore] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("PayPay");
  const [category, setCategory] = useState<string>("食費");
  const [usedDate, setUsedDate] = useState(() => toDateStr(new Date()));
  const [usedTime, setUsedTime] = useState<string | null>(null); // レシートから読み取った時刻（手入力のときは null）
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [scanNotes, setScanNotes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catError, setCatError] = useState<string | null>(null);
  const categoryNames = useMemo(() => categories.map((c) => c.name), [categories]);
  const colorOf = useMemo(() => makeColorOf(categories), [categories]);

  const [slide, setSlide] = useState<"left" | "right" | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const goTab = (next: Tab) => {
    if (next === tab) return;
    setSlide(TAB_ORDER.indexOf(next) > TAB_ORDER.indexOf(tab) ? "left" : "right");
    setTab(next);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const el = e.target as HTMLElement;
    const blocked =
      e.touches.length !== 1 ||
      !!el.closest("input, select, textarea, [data-no-swipe]") ||
      t.clientX < EDGE_GUARD ||
      t.clientX > window.innerWidth - EDGE_GUARD;
    touch.current = blocked ? null : { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_X || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
    const i = TAB_ORDER.indexOf(tab) + (dx < 0 ? 1 : -1); // 左へスワイプ → 次のタブ
    if (i >= 0 && i < TAB_ORDER.length) goTab(TAB_ORDER[i]);
  };

  const requestId = useRef(0);

  const fetchExpenses = useCallback(async () => {
    const id = ++requestId.current;
    const from = month.toISOString();
    const to = monthStart(month, 1).toISOString();

    const cur = await supabase
      .from("expenses")
      .select("*")
      .gte("used_at", from)
      .lt("used_at", to)
      .order("used_at", { ascending: false });
    if (id !== requestId.current) return; // 月を切り替えた後の古い応答は捨てる

    if (cur.error) setError(cur.error.message);
    else {
      setError(null);
      setExpenses(cur.data as Expense[]);
    }
    setLoading(false);
  }, [month]);

  useEffect(() => {
    setLoading(true);
    fetchExpenses();
  }, [fetchExpenses]);

  // カテゴリ一覧は DB から取得する。取得できなければ既定値のまま
  useEffect(() => {
    supabase
      .from("categories")
      .select("name,color")
      .order("sort_order")
      .order("created_at")
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) setCategories(data as Category[]);
      });
  }, []);

  const sortedExpenses = useMemo(() => {
    const list = [...expenses];
    const t = (e: Expense) => new Date(e.used_at).getTime();
    switch (sortKey) {
      case "date-asc": return list.sort((a, b) => t(a) - t(b));
      case "amount-desc": return list.sort((a, b) => b.amount - a.amount || t(b) - t(a));
      case "amount-asc": return list.sort((a, b) => a.amount - b.amount || t(b) - t(a));
      default: return list.sort((a, b) => t(b) - t(a));
    }
  }, [expenses, sortKey]);

  const monthTotal = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const isCurrentMonth = month.getTime() === monthStart(new Date()).getTime();

  const add = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const n = parseInt(amount, 10);
    if (!n || n <= 0) return;
    setSubmitting(true);
    const { error } = await supabase.from("expenses").insert({
      used_at: toUsedAt(usedDate, usedTime),
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
    // 追加した支出が見えるよう、その日付の月に切り替えて再取得する
    setMonth(monthStart(new Date(`${usedDate}T00:00:00`)));
    setUsedDate(toDateStr(new Date()));
    setUsedTime(null);
    setScanNotes([]);
    setReceiptPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  // 月次分析のカレンダーから、指定した日の支出を追加する。成功なら null、失敗ならメッセージを返す
  const addForDay = async (
    dateStr: string,
    v: { amount: number; store: string; category: string; method: PaymentMethod }
  ) => {
    const { error } = await supabase.from("expenses").insert({
      used_at: toUsedAt(dateStr, null),
      store: v.store.trim() || v.category,
      amount: v.amount,
      category: v.category,
      payment_method: v.method,
      source: "manual",
    });
    if (error) return error.message;
    await fetchExpenses();
    return null;
  };

  // レシートの読み取り結果を、入力フォームに反映する（確認・編集してから「追加」を押す）
  const applyReceipt = (r: ReceiptResult, previewUrl: string) => {
    const notes: string[] = [];
    if (r.amount) setAmount(String(r.amount));
    else notes.push("金額を読み取れませんでした。入力してください");
    if (r.store) setStore(r.store);
    else notes.push("店名を読み取れませんでした");
    if (r.date) {
      setUsedDate(r.date);
      setUsedTime(r.time);
    } else {
      notes.push("日付を読み取れませんでした。今日の日付のままです");
    }
    if (r.category && categoryNames.includes(r.category)) setCategory(r.category);
    if (r.payment_method === "クレジットカード") {
      setMethod("その他");
      notes.push(
        "支払いがクレジットカードです。三井住友カードなら Gmail の自動取り込みと二重になるので、追加しないでください"
      );
    } else if (r.payment_method && METHODS.includes(r.payment_method as PaymentMethod)) {
      setMethod(r.payment_method as PaymentMethod);
    }
    setScanNotes(notes);
    setReceiptPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return previewUrl;
    });
  };

  const addCategory = async () => {
    const name = newCatName.trim();
    if (name.length < 1 || name.length > 20) return setCatError("名前は1〜20文字で入力してください");
    if (name === UNCATEGORIZED || categoryNames.includes(name))
      return setCatError("同じ名前のカテゴリがあります");
    const color = pickNewColor(categories.map((c) => c.color));
    const { error } = await supabase
      .from("categories")
      .insert({ name, color, sort_order: categories.length + 1 });
    if (error) return setCatError(error.message);
    setCategories([...categories, { name, color }]);
    setCategory(name);
    setNewCatName("");
    setCatError(null);
    setAddingCat(false);
  };

  const remove = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return setError(error.message);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    fetchExpenses();
  };

  // カテゴリの変更。カード利用（自動）は店名のルールとして保存し、同じ店名の履歴もまとめて直す
  const recategorize = async (e: Expense, newCategory: string) => {
    if (e.source === "auto") {
      const upd = await supabase
        .from("expenses")
        .update({ category: newCategory })
        .eq("store", e.store)
        .eq("source", "auto");
      if (upd.error) return setError(upd.error.message);
      const rule = await supabase
        .from("category_rules")
        .upsert({ keyword: e.store, category: newCategory });
      if (rule.error) return setError(rule.error.message);
    } else {
      const upd = await supabase.from("expenses").update({ category: newCategory }).eq("id", e.id);
      if (upd.error) return setError(upd.error.message);
    }
    fetchExpenses();
  };

  return (
    <main
      className="mx-auto min-h-screen max-w-md pb-[env(safe-area-inset-bottom)]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Header */}
      <header className="bg-emerald-600 px-5 pb-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] text-white">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setMonth(monthStart(month, -1))}
            aria-label="前の月"
            className="p-1 opacity-80 active:opacity-100"
          >
            <ChevronLeft size={20} />
          </button>
          <p className="flex items-center gap-1.5 text-sm" suppressHydrationWarning>
            <Wallet size={16} /> {month.getFullYear()}年{month.getMonth() + 1}月の支出
          </p>
          <button
            onClick={() => setMonth(monthStart(month, 1))}
            disabled={isCurrentMonth}
            aria-label="次の月"
            className="p-1 opacity-80 active:opacity-100 disabled:opacity-20"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <p className="mt-1 text-center text-4xl font-bold tracking-tight">{yen(monthTotal)}</p>
      </header>

      {/* Tabs */}
      <nav className="flex border-b border-slate-200 bg-white">
        {(
          [
            ["history", "入力・履歴"],
            ["analysis", "月次分析"],
            ["trend", "月次推移"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => goTab(key)}
            className={`flex-1 py-3 text-sm font-semibold ${
              tab === key ? "border-b-2 border-emerald-600 text-emerald-700" : "text-slate-400"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div
        key={tab}
        className={`space-y-5 p-4 ${slide === "left" ? "slide-in-left" : slide === "right" ? "slide-in-right" : ""}`}
      >
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        {tab === "trend" ? (
          <TrendTab colorOf={colorOf} categoryNames={categoryNames} />
        ) : tab === "analysis" ? (
          loading ? (
            <p className="p-4 text-center text-sm text-slate-400">読み込み中…</p>
          ) : (
            <AnalysisTab
              expenses={expenses}
              month={month}
              colorOf={colorOf}
              categoryNames={categoryNames}
              methods={METHODS}
              onAdd={addForDay}
            />
          )
        ) : (
          <>
            {/* Quick Input Form */}
            <form onSubmit={add} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
              <ReceiptScanner categories={categoryNames} onResult={applyReceipt} />
              {receiptPreview && (
                <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-2">
                  <a href={receiptPreview} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={receiptPreview} alt="撮影したレシート" className="h-24 w-auto rounded border border-slate-200" />
                  </a>
                  <p className="text-xs text-slate-500">
                    読み取り結果を入力欄に反映しました。写真と見比べて、違うところを直してから「追加」を押してください。
                    写真をタップすると拡大できます。
                  </p>
                </div>
              )}
              {scanNotes.length > 0 && (
                <ul className="space-y-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                  {scanNotes.map((n) => (
                    <li key={n}>・{n}</li>
                  ))}
                </ul>
              )}
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
              <input
                type="date"
                value={usedDate}
                max={toDateStr(new Date())}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setUsedDate(e.target.value);
                  setUsedTime(null); // 日付を直したら、読み取った時刻は使わない
                }}
                aria-label="日付"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500"
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
              <div className="flex gap-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500"
                >
                  {categoryNames.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setAddingCat(!addingCat);
                    setCatError(null);
                  }}
                  aria-label="カテゴリを追加"
                  className="shrink-0 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 active:bg-slate-50"
                >
                  ＋カテゴリ
                </button>
              </div>
              {addingCat && (
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={20}
                      placeholder="新しいカテゴリ名"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          addCategory();
                        }
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={addCategory}
                      className="shrink-0 rounded-lg bg-slate-800 px-3 text-sm font-medium text-white active:bg-slate-700"
                    >
                      作成
                    </button>
                  </div>
                  {catError && <p className="text-xs text-red-600">{catError}</p>}
                </div>
              )}
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
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-slate-500">履歴</h2>
                <select
                  value={sortKey}
                  onChange={(ev) => setSortKey(ev.target.value as typeof sortKey)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
                  aria-label="並び順"
                >
                  <option value="date-desc">日付が新しい順</option>
                  <option value="date-asc">日付が古い順</option>
                  <option value="amount-desc">金額が高い順</option>
                  <option value="amount-asc">金額が低い順</option>
                </select>
              </div>
              {loading ? (
                <p className="p-4 text-center text-sm text-slate-400">読み込み中…</p>
              ) : expenses.length === 0 ? (
                <p className="p-4 text-center text-sm text-slate-400">この月の支出はありません</p>
              ) : (
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm">
                  {sortedExpenses.map((e) => {
                    const auto = e.source === "auto";
                    const cat = e.category || UNCATEGORIZED;
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
                          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                            <span>
                              {fmtDate(e.used_at)} ・ {e.payment_method}
                            </span>
                            <select
                              value={cat}
                              onChange={(ev) => recategorize(e, ev.target.value)}
                              aria-label="カテゴリ"
                              style={{ background: colorOf(cat) }}
                              className="max-w-[9rem] shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                            >
                              <option value={UNCATEGORIZED}>{UNCATEGORIZED}</option>
                              {categoryNames.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                              {cat !== UNCATEGORIZED && !categoryNames.includes(cat) && (
                                <option value={cat}>{cat}</option>
                              )}
                            </select>
                          </div>
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
          </>
        )}
      </div>
    </main>
  );
}
