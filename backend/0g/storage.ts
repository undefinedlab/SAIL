/**
 * 0G Storage adapter (testnet).
 *
 * SAIL uses 0G Storage Log mode as the permanent audit trail. Each commit blob
 * is encrypted, uploaded here, and the returned root hash is anchored on the
 * SAIL contract as the commitment CID. Tamper-evident by content addressing —
 * any modification of a stored blob changes its root hash and invalidates the
 * on-chain anchor.
 *
 * Active commitment state is read directly from the SAIL contract; we don't
 * mirror it into 0G KV in v1 (the contract is the source of truth, and a
 * KV mirror would be a pure optimization, not a guarantee).
 *
 * Testnet endpoints:
 *   RPC:     https://evmrpc-testnet.0g.ai
 *   Indexer: https://indexer-storage-testnet-turbo.0g.ai
 */

import { Indexer, ZgFile } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";
import { writeFile, unlink, readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { env } from "../src/config/env.js";

const provider = new ethers.JsonRpcProvider(env.zeroG.rpcUrl);
const signer = new ethers.Wallet(env.zeroG.privateKey, provider);
const indexer = new Indexer(env.zeroG.indexerUrl);

/** Default upload timeout in ms (3 minutes). */
const UPLOAD_TIMEOUT_MS = 3 * 60 * 1000;

/** Gas overrides — higher gas price ensures faster tx inclusion on the testnet. */
const TX_OPTS = {
  gasPrice: ethers.parseUnits("25", "gwei"),
  gasLimit: 1_000_000n,
};

/** Wrap a promise with a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Upload a blob to 0G Storage Log mode.
 * Returns the root hash that should be anchored on the SAIL contract as the CID.
 */
export type UploadOpts = {
  /** Wait for storage node finalization (default: false on testnet). */
  finalityRequired?: boolean;
  /** Upload timeout in ms (default: 3 min). */
  timeoutMs?: number;
};

export async function uploadBlob(blob: Uint8Array, opts?: UploadOpts): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "sail-blob-"));
  const filePath = path.join(dir, "blob.bin");

  try {
    await writeFile(filePath, blob);
    const file = await ZgFile.fromFilePath(filePath);
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr || !tree) throw new Error(`merkleTree failed: ${treeErr ?? "unknown"}`);

    const rootHash = tree.rootHash();
    if (!rootHash) throw new Error("Empty root hash from merkleTree");

    const uploadPromise = indexer.upload(
      file,
      env.zeroG.rpcUrl,
      signer,
      { finalityRequired: opts?.finalityRequired ?? false },
      undefined,   // retryOpts
      TX_OPTS,      // TransactionOptions — gasPrice + gasLimit
    );

    const timeout = opts?.timeoutMs ?? UPLOAD_TIMEOUT_MS;
    const [, uploadErr] = await withTimeout(uploadPromise, timeout, "0G Storage upload");
    if (uploadErr) throw new Error(`upload failed: ${uploadErr.message ?? uploadErr}`);

    return rootHash;
  } finally {
    await unlink(filePath).catch(() => {});
  }
}

/**
 * Download a blob from 0G Storage Log mode by root hash.
 */
export async function downloadBlob(rootHash: string): Promise<Uint8Array> {
  const dir = await mkdtemp(path.join(tmpdir(), "sail-blob-dl-"));
  const filePath = path.join(dir, "blob.bin");

  try {
    const err = await indexer.download(rootHash, filePath, true);
    if (err) throw new Error(`download failed: ${err.message ?? err}`);
    return new Uint8Array(await readFile(filePath));
  } finally {
    await unlink(filePath).catch(() => {});
  }
}

/**
 * Download a blob and return as Blob (browser-safe variant).
 * Useful when callers don't want to write to disk.
 */
export async function downloadBlobToBuffer(rootHash: string): Promise<Uint8Array> {
  const [blob, err] = await indexer.downloadToBlob(rootHash);
  if (err) throw new Error(`download failed: ${err.message ?? err}`);
  return new Uint8Array(await blob.arrayBuffer());
}
