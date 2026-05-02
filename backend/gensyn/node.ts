/**
 * AXL node manager aligned with the public gensyn-ai/axl repository.
 *
 * The real setup is source-first:
 *   1. Clone gensyn-ai/axl
 *   2. Build `./cmd/node` with Go
 *   3. Generate an ed25519 key
 *   4. Write `node-config.json`
 *   5. Run `./node -config node-config.json`
 */

import { spawn, type ChildProcess, execFile as execFileCb } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import { env } from "../src/config/env.js";
import { isAlive } from "./client.js";

const execFile = promisify(execFileCb);

const AXL_DIR = path.join(process.cwd(), ".axl");
const REPO_DIR = path.join(AXL_DIR, "repo");
const CONFIG_PATH = path.join(AXL_DIR, "node-config.json");
const KEY_PATH = path.join(AXL_DIR, "private.pem");
const BINARY_PATH = path.join(REPO_DIR, "node");

let axlProcess: ChildProcess | null = null;

function parseCsvEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function runOrThrow(command: string, args: string[], cwd?: string, extraEnv?: NodeJS.ProcessEnv) {
  try {
    await execFile(command, args, {
      cwd,
      env: { ...process.env, ...(extraEnv ?? {}) },
    });
  } catch (error) {
    const message =
      error instanceof Error && "stderr" in error
        ? String((error as Error & { stderr?: string }).stderr || error.message)
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(`${command} ${args.join(" ")} failed: ${message}`.trim());
  }
}

async function ensureGoInstalled(): Promise<void> {
  try {
    await execFile("go", ["version"]);
  } catch {
    throw new Error(
      "Go 1.25.x is required to build the real AXL node. Install it with `brew install go` on macOS, then retry.",
    );
  }
}

async function ensureRepo(): Promise<void> {
  mkdirSync(AXL_DIR, { recursive: true });

  if (!existsSync(REPO_DIR)) {
    await runOrThrow("git", ["clone", "--depth", "1", "https://github.com/gensyn-ai/axl.git", REPO_DIR]);
    return;
  }

  await runOrThrow("git", ["fetch", "--depth", "1", "origin", "main"], REPO_DIR);
  await runOrThrow("git", ["reset", "--hard", "origin/main"], REPO_DIR);
}

async function ensureBuiltBinary(): Promise<void> {
  await ensureGoInstalled();
  await ensureRepo();
  await runOrThrow("go", ["build", "-o", "node", "./cmd/node/"], REPO_DIR);
}

async function ensureIdentityKey(): Promise<void> {
  if (existsSync(KEY_PATH)) {
    return;
  }

  mkdirSync(AXL_DIR, { recursive: true });

  const macOpenSsl = "/opt/homebrew/opt/openssl/bin/openssl";
  if (process.platform === "darwin" && existsSync(macOpenSsl)) {
    await runOrThrow(macOpenSsl, ["genpkey", "-algorithm", "ed25519", "-out", KEY_PATH]);
    return;
  }

  await runOrThrow("openssl", ["genpkey", "-algorithm", "ed25519", "-out", KEY_PATH]);
}

function writeConfig(): void {
  const bridgeUrl = new URL(env.axl.bridgeUrl);
  const bridgePort = Number(bridgeUrl.port || "9002");
  const bridgeAddr = bridgeUrl.hostname || "127.0.0.1";
  const peers = parseCsvEnv("AXL_PEERS");
  const listen = parseCsvEnv("AXL_LISTEN");
  const tcpPort = Number(process.env["AXL_TCP_PORT"] || "7000");

  const config: Record<string, unknown> = {
    PrivateKeyPath: KEY_PATH,
    Peers: peers,
    api_port: bridgePort,
    bridge_addr: bridgeAddr,
    tcp_port: tcpPort,
  };

  if (listen.length) {
    config["Listen"] = listen;
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/** Start the AXL node and wait until its HTTP bridge is reachable. */
export async function startAxlNode(timeoutMs = 30_000): Promise<void> {
  if (await isAlive()) {
    console.log("[AXL] already running — skipping start");
    return;
  }

  await ensureBuiltBinary();
  await ensureIdentityKey();
  writeConfig();

  axlProcess = spawn(BINARY_PATH, ["-config", CONFIG_PATH], {
    cwd: REPO_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  axlProcess.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(`[AXL] ${chunk.toString()}`);
  });
  axlProcess.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[AXL] ${chunk.toString()}`);
  });

  axlProcess.on("exit", (code) => {
    console.warn(`[AXL] process exited with code ${code}`);
    axlProcess = null;
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isAlive()) {
      console.log("[AXL] node is up");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
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
process.on("SIGINT", () => {
  stopAxlNode();
  process.exit();
});
process.on("SIGTERM", () => {
  stopAxlNode();
  process.exit();
});
