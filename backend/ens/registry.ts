/**
 * ENS adapter for SAIL agent identity.
 *
 * Every SAIL agent gets a subdomain under the operator's ENS name.
 * Text records store everything another agent needs to interact:
 *   axl_peer_id   → AXL mesh peer ID (how to reach this agent P2P)
 *   sail_tier     → optimistic | zk | tee
 *   sail_contract → SAIL contract address
 *   capabilities  → comma-separated list
 *   auditors      → comma-separated auditor addresses
 *
 * Uses viem's ENS utilities + the ENS public resolver.
 *
 * Sepolia ENS contracts:
 *   Registry:        0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
 *   Public resolver: 0x8FADE66B79cC9f707aB26799354482EB93a5B7dD
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  namehash,
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";
import { env } from "../src/config/env.js";

// ---- Sepolia ENS contract addresses ----------------------------------------
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as Address;
const PUBLIC_RESOLVER = "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD" as Address;

// ---- Minimal ABIs -----------------------------------------------------------
const REGISTRY_ABI = [
  {
    name: "setSubnodeRecord",
    type: "function",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "label", type: "bytes32" },
      { name: "owner", type: "address" },
      { name: "resolver", type: "address" },
      { name: "ttl", type: "uint64" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "owner",
    type: "function",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;

const RESOLVER_ABI = [
  {
    name: "setText",
    type: "function",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "text",
    type: "function",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    name: "setAddr",
    type: "function",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "addr", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ---- Clients ----------------------------------------------------------------
const account = privateKeyToAccount(
  (env.sail.operatorKey.startsWith("0x")
    ? env.sail.operatorKey
    : `0x${env.sail.operatorKey}`) as Hex,
);

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(env.sail.rpcUrl),
});

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(env.sail.rpcUrl),
});

// ---- Helpers ----------------------------------------------------------------
import { keccak256, toBytes } from "viem";

function labelHash(label: string): Hex {
  return keccak256(toBytes(label));
}

// ---- Public API -------------------------------------------------------------

export type AgentTextRecords = {
  axl_peer_id?: string;
  sail_tier?: "optimistic" | "zk" | "tee";
  sail_contract?: string;
  capabilities?: string;
  auditors?: string;
  [key: string]: string | undefined;
};

/**
 * Register a subdomain under a parent ENS name and write agent text records.
 * The operator wallet must own the parent ENS name.
 *
 * @param parentName  e.g. "sail.eth" or "myname.eth"
 * @param subLabel    e.g. "treasury-agent" → becomes treasury-agent.sail.eth
 * @param records     Text records to write
 * @param walletAddr  The address this name resolves to (usually operator wallet)
 */
export async function registerAgentSubname(
  parentName: string,
  subLabel: string,
  records: AgentTextRecords,
  walletAddr?: Address,
): Promise<{ ensName: string; txHashes: Hex[] }> {
  const ensName = `${subLabel}.${parentName}`;
  const normalised = normalize(parentName);
  const parentNode = namehash(normalised);
  const subNode = namehash(normalize(ensName));
  const txHashes: Hex[] = [];

  // 1. setSubnodeRecord — create the subdomain
  const subTx = await walletClient.writeContract({
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "setSubnodeRecord",
    args: [
      parentNode,
      labelHash(subLabel),
      account.address,
      PUBLIC_RESOLVER,
      0n,
    ],
  });
  txHashes.push(subTx);
  await publicClient.waitForTransactionReceipt({ hash: subTx });

  // 2. setAddr — point the name to the wallet
  if (walletAddr ?? account.address) {
    const addrTx = await walletClient.writeContract({
      address: PUBLIC_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: "setAddr",
      args: [subNode, walletAddr ?? account.address],
    });
    txHashes.push(addrTx);
    await publicClient.waitForTransactionReceipt({ hash: addrTx });
  }

  // 3. setText — write each record
  for (const [key, value] of Object.entries(records)) {
    if (!value) continue;
    const textTx = await walletClient.writeContract({
      address: PUBLIC_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: "setText",
      args: [subNode, key, value],
    });
    txHashes.push(textTx);
    await publicClient.waitForTransactionReceipt({ hash: textTx });
  }

  return { ensName, txHashes };
}

/**
 * Read all known SAIL text records for an ENS name.
 */
export async function resolveAgentRecords(ensName: string): Promise<AgentTextRecords> {
  const node = namehash(normalize(ensName));
  const keys: string[] = [
    "axl_peer_id",
    "sail_tier",
    "sail_contract",
    "capabilities",
    "auditors",
  ];

  const records: AgentTextRecords = {};
  await Promise.all(
    keys.map(async (key) => {
      try {
        const value = await publicClient.readContract({
          address: PUBLIC_RESOLVER,
          abi: RESOLVER_ABI,
          functionName: "text",
          args: [node, key],
        });
        if (value) records[key] = value;
      } catch {
        // name not registered or record not set — skip
      }
    }),
  );

  return records;
}

/**
 * Quick sanity check: does the operator wallet own this ENS name?
 */
export async function ownsName(ensName: string): Promise<boolean> {
  try {
    const node = namehash(normalize(ensName));
    const owner = await publicClient.readContract({
      address: ENS_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "owner",
      args: [node],
    });
    return owner.toLowerCase() === account.address.toLowerCase();
  } catch {
    return false;
  }
}
