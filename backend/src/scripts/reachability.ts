/**
 * Verify you can reach a SAIL API (GET /health) from this machine.
 *
 * Usage:
 *   npm run test:reach
 *   npm run test:reach -- http://localhost:3001
 *   SAIL_TEST_BASE_URL=http://127.0.0.1:3001 npm run test:reach
 *
 * With --cors, sends Origin: http://localhost:3000 to mimic a browser tab (checks CORS header shape).
 */

const defaultBase = "https://sail-production-50ff.up.railway.app";

function baseUrl(): string {
  const fromEnv = process.env.SAIL_TEST_BASE_URL?.trim();
  const args = process.argv.slice(2).filter((a) => a !== "--cors");
  const fromArg = args[0]?.trim();
  const raw = fromArg || fromEnv || defaultBase;
  return raw.replace(/\/+$/, "");
}

const withCors = process.argv.includes("--cors");

async function main() {
  const base = baseUrl();
  const url = `${base}/health`;
  console.log(`GET ${url}${withCors ? " (Origin: http://localhost:3000)" : ""}`);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(withCors ? { Origin: "http://localhost:3000" } : {}),
      },
    });
    const text = await res.text();
    const acao = res.headers.get("access-control-allow-origin");
    console.log(`HTTP ${res.status}`);
    if (acao) console.log(`Access-Control-Allow-Origin: ${acao}`);
    if (acao?.includes(",")) {
      console.warn(
        "Warning: Allow-Origin contains a comma — browsers reject this; use an array of origins on the backend.",
      );
    }
    if (!res.ok) {
      console.error(text.slice(0, 500));
      process.exit(1);
    }
    try {
      const j = JSON.parse(text) as {
        ok?: boolean;
        contract?: string;
        operator?: string;
        chainId?: number;
      };
      console.log(
        `ok=${j.ok} chainId=${j.chainId} contract=${j.contract?.slice(0, 14)}… operator=${j.operator?.slice(0, 14)}…`,
      );
    } catch {
      console.log(text.slice(0, 400));
    }
  } catch (e) {
    console.error("Fetch failed:", (e as Error).message);
    process.exit(1);
  }
}

main();

export {};
