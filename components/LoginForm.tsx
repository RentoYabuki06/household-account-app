"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError("メールアドレスまたはパスワードが違います");
    // 成功時は onAuthStateChange で画面が切り替わる
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <h1 className="mb-6 text-center text-2xl font-bold text-emerald-700">My家計簿</h1>
      <form onSubmit={submit} className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
        <input
          type="email"
          autoComplete="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500"
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-3 font-semibold text-white active:bg-emerald-700 disabled:opacity-50"
        >
          <LogIn size={18} /> ログイン
        </button>
      </form>
    </main>
  );
}
