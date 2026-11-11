export type Category = { name: string; color: string };

export const UNCATEGORIZED = "未分類";
export const UNCATEGORIZED_COLOR = "#94a3b8";

// DB（categories テーブル）から取得できないときの既定値。DB の初期データと同じ。
export const DEFAULT_CATEGORIES: Category[] = [
  { name: "コーヒー", color: "#92400e" },
  { name: "食費", color: "#ea580c" },
  { name: "日用品", color: "#0d9488" },
  { name: "書籍", color: "#2563eb" },
  { name: "交通費", color: "#7c3aed" },
  { name: "交際費", color: "#db2777" },
  { name: "サブスクリプション", color: "#0891b2" },
  { name: "医療費", color: "#dc2626" },
  { name: "美容", color: "#c026d3" },
  { name: "その他", color: "#64748b" },
];

// 追加したカテゴリに順に割り当てる色（既定の色と区別しやすいもの）
const EXTRA_COLORS = [
  "#65a30d", "#ca8a04", "#0284c7", "#9333ea", "#e11d48", "#059669", "#d97706", "#4f46e5",
];

export const pickNewColor = (used: string[]) =>
  EXTRA_COLORS.find((c) => !used.includes(c)) ?? EXTRA_COLORS[used.length % EXTRA_COLORS.length];

export const makeColorOf = (categories: Category[]) => {
  const map = new Map(categories.map((c) => [c.name, c.color]));
  return (name: string) => (name === UNCATEGORIZED ? UNCATEGORIZED_COLOR : map.get(name) ?? UNCATEGORIZED_COLOR);
};
