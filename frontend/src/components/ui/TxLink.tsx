"use client";

type Props = { hash: string; label?: string };

export function TxLink({ hash, label }: Props) {
  const short = `${hash.slice(0, 10)}…${hash.slice(-6)}`;
  return (
    <a
      href={`https://sepolia.etherscan.io/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800"
    >
      {label ?? short}
    </a>
  );
}
