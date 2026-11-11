export const CATEGORIES = [
  "コーヒー",
  "食費",
  "日用品",
  "書籍",
  "交通費",
  "交際費",
  "サブスクリプション",
  "医療費",
  "美容",
  "その他",
] as const;

export const UNCATEGORIZED = "未分類";

// グラフ用の色（カテゴリごとに区別できる配色）
export const CATEGORY_COLORS: Record<string, string> = {
  コーヒー: "#92400e",
  食費: "#ea580c",
  日用品: "#0d9488",
  書籍: "#2563eb",
  交通費: "#7c3aed",
  交際費: "#db2777",
  サブスクリプション: "#0891b2",
  医療費: "#dc2626",
  美容: "#c026d3",
  その他: "#64748b",
  [UNCATEGORIZED]: "#94a3b8",
};

export const colorOf = (category: string) => CATEGORY_COLORS[category] ?? "#94a3b8";
