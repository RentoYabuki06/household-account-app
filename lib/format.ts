export const yen = (n: number) =>
  `${n < 0 ? "-" : ""}¥${Math.abs(n).toLocaleString("ja-JP")}`;
