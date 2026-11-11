"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";

export type ReceiptResult = {
  store: string;
  amount: number | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM
  category: string | null;
  payment_method: string | null;
};

type Props = {
  categories: string[];
  onResult: (result: ReceiptResult, previewUrl: string) => void;
};

const PASS_KEY = "receipt-passphrase";
const MAX_SIDE = 1600; // 長辺の最大ピクセル数（読み取りに十分で、送る量を抑えられる）
const MAX_BYTES = 1.4 * 1024 * 1024; // サーバーの上限（1.5MB）より少し小さく

const loadPass = () => {
  try {
    return localStorage.getItem(PASS_KEY);
  } catch {
    return null;
  }
};
const savePass = (v: string) => {
  try {
    localStorage.setItem(PASS_KEY, v);
  } catch {}
};
const clearPass = () => {
  try {
    localStorage.removeItem(PASS_KEY);
  } catch {}
};

// 撮影した写真を、読み取りに十分な大きさの JPEG に縮小する（向きの情報も反映する）
async function compress(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    bitmap = await createImageBitmap(file);
  }
  let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  let quality = 0.85;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を処理できません");
  for (let i = 0; i < 4; i++) {
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) {
      bitmap.close();
      return blob;
    }
    quality -= 0.1;
    scale *= 0.8;
  }
  bitmap.close();
  throw new Error("画像を小さくできませんでした");
}

export default function ReceiptScanner({ categories, onResult }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = useRef<{ blob: Blob; previewUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needPass, setNeedPass] = useState(false);
  const [passInput, setPassInput] = useState("");

  const run = async (pass: string) => {
    const p = pending.current;
    if (!p) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("image", new File([p.blob], "receipt.jpg", { type: "image/jpeg" }));
      form.append("categories", JSON.stringify(categories));
      const res = await fetch("/api/receipt", {
        method: "POST",
        headers: { "x-receipt-passphrase": pass },
        body: form,
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) {
        clearPass();
        setNeedPass(true);
        setError("合言葉が違います");
      } else if (res.ok && json?.ok) {
        savePass(pass); // 成功したときだけ、この端末に覚えさせる
        setNeedPass(false);
        setPassInput("");
        onResult(json.result as ReceiptResult, p.previewUrl);
        pending.current = null;
      } else {
        setError(json?.error ?? "読み取りに失敗しました");
      }
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const blob = await compress(file);
      pending.current = { blob, previewUrl: URL.createObjectURL(blob) };
    } catch (e) {
      setBusy(false);
      return setError(e instanceof Error ? e.message : "画像を処理できませんでした");
    }
    setBusy(false);
    const pass = loadPass();
    if (pass) await run(pass);
    else setNeedPass(true);
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ""; // 同じファイルをもう一度選べるようにする
          if (f) onFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-600 py-2.5 text-sm font-semibold text-emerald-700 active:bg-emerald-50 disabled:opacity-50"
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
        {busy ? "読み取り中…" : "レシートを撮影して自動入力"}
      </button>

      {needPass && !busy && (
        <div className="flex gap-2">
          <input
            type="password"
            autoComplete="off"
            placeholder="合言葉（この端末に覚えさせます）"
            value={passInput}
            onChange={(e) => setPassInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (passInput) run(passInput);
              }
            }}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={() => passInput && run(passInput)}
            className="shrink-0 rounded-lg bg-slate-800 px-3 text-sm font-medium text-white active:bg-slate-700"
          >
            読み取る
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
