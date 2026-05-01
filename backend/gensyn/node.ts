/**
 * AXL node manager.
 *
 * Downloads the AXL binary for the current platform (if not already present),
 * generates or loads an identity key, writes a config file, and spawns the
 * AXL process as a child of the backend. Manages graceful shutdown.
 *
 * AXL binary releases: https://github.com/gensyn-ai/axl/releases
 * Config format: https://docs.gensyn.ai/tech/agent-exchange-layer
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { env } from "../src/config/env.js";
import { isAlive } from "./client.js";

const execAsync = promisify(exec);

const AXL_DIR = path.join(process.cwd(), ".axl");
const CONFIG_PATH = path.join(AXL_DIR, "node-config.json");
const KEY_PATH = path.join(AXL_DIR, "identity.key");
const BINARY_PATH = path.join(AXL_DIR, "axl-node");

let axlProcess: ChildProcess | null = null;

function platform(): string {
  const p = process.platform;
  const a = process.arch;
  if (p === "linux" && a === "x64") return "linux-amd64";
  if (p === "linux" && a === "arm64") return "linux-arm64";
  if (p === "darwin" && a === "x64") return "darwin-amd64";
  if (p === "darwin" && a === "arm64") return "darwin-arm64";
  throw new Error(`Unsupported platform: ${p}/${a}`);
}

async function downloadBinary(): Promise<void> {
  if (existsSync(BINARY_PATH)) return;
  mkdirSync(AXL_DIR, { recursive: true });

  const plat = platform();
  // Latest AXL release binary naming — update tag as new releases ship
  const tag = "v0.1.0";
  const url = `https://github.com/gensyn-ai/axl/releases/download/${tag}/axl-node-${plat}`;
  console.log(`[AXL] downloading binary for ${plat} from ${url}…`);
  await execAsync(`curl -fsSL "${url}" -o "${BINARY_PATH}" && chmod +x "${BINARY_PATH}"`);
  console.log("[AXL] binary downloaded");
}

async function ensureIdentityKey(): Promise<void> {
  if (existsSync(KEY_PATH)) return;
  mkdirSync(AXL_DIR, { recursive: true });
  await execAsync(`openssl genrsa -out "${KEY_PATH}" 2048 2>/dev/null`);
  console.log("[AXL] identity key generated");
}

function writeConfig(): void {
  const bridgePort = new URL(env.axl.bridgeUrl).port || "9002";
  const config = {
    listenPort: 0,
    httpBridgePort: parseInt(bridgePort, 10),
    privateKeyFile: KEY_PATH,
    logLevel: "warn",
  };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/** Start the AXL node and wait until its HTTP bridge is reachable. */
export async function startAxlNode(timeoutMs = 30_000): Promise<void> {
  if (await isAlive()) {
    console.log("[AXL] already running — skipping start");
    return;
  }

  await downloadBinary();
  await ensureIdentityKey();
  writeConfig();

  axlProcess = spawn(BINARY_PATH, ["-config", CONFIG_PATH], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  axlProcess.stdout?.on("data", (d: Buffer) =>
    process.stdout.write(`[AXL] ${d.toString()}`),
  );
  axlProcess.stderr?.on("data", (d: Buffer) =>
    process.stderr.write(`[AXL] ${d.toString()}`),
  );

  axlProcess.on("exit", (code) => {
    console.warn(`[AXL] process exited with code ${code}`);
    axlProcess = null;
  });

  // Wait for the HTTP bridge to become reachable
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isAlive()) {
      console.log("[AXL] node is up");
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("[AXL] node did not come up within timeout");
}

/** Gracefully stop the AXL node. */
export function stopAxlNode(): void {
  if (axlProcess) {
    axlProcess.kill("SIGTERM");
    axlProcess = null;
  }
}

process.on("exit", stopAxlNode);
process.on("SIGINT", () => { stopAxlNode(); process.exit(); });
process.on("SIGTERM", () => { stopAxlNode(); process.exit(); });
