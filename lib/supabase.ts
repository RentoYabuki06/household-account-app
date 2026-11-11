import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type PaymentMethod = "三井住友カード" | "PayPay" | "現金" | "その他";

export type Expense = {
  id: string;
  used_at: string;
  store: string;
  amount: number;
  category: string | null;
  payment_method: PaymentMethod | null;
  source: "auto" | "manual" | null;
  memo: string | null;
  created_at: string;
};
