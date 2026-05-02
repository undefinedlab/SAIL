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
const ENS_REGISTRY    = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as Address;
const PUBLIC_RESOLVER = "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD" as Address;
// NameWrapper wraps names via ERC-1155; registry.owner() returns this address
// for any wrapped name. The real owner is tracked inside NameWrapper.
const NAME_WRAPPER    = "0x0635513f179D50A207757E05759CbD106d7dFcE8" as Address;

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

// NameWrapper exposes ERC-1155 ownerOf. Token ID = uint256(namehash).
const NAME_WRAPPER_ABI = [
  {
    name: "ownerOf",
    type: "function",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    // Returns (owner, fuses, expiry) for a wrapped name. tokenId = uint256(namehash).
    name: "getData",
    type: "function",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "owner",  type: "address" },
      { name: "fuses",  type: "uint32"  },
      { name: "expiry", type: "uint64"  },
    ],
    stateMutability: "view",
  },
  {
    name: "setSubnodeRecord",
    type: "function",
    inputs: [
      { name: "parentNode", type: "bytes32" },
      { name: "label",      type: "string"  },
      { name: "owner",      type: "address" },
      { name: "resolver",   type: "address" },
      { name: "ttl",        type: "uint64"  },
      { name: "fuses",      type: "uint32"  },
      { name: "expiry",     type: "uint64"  },
    ],
    outputs: [{ name: "node", type: "bytes32" }],
    stateMutability: "nonpayable",
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
): Promise<{ ensName: string; txHashes: Hex[]; pendingRecords?: boolean }> {
  const ensName = `${subLabel}.${parentName}`;
  const normalised = normalize(parentName);
  const parentNode = namehash(normalised);
  const subNode = namehash(normalize(ensName));
  const txHashes: Hex[] = [];

  // 1. setSubnodeRecord — route through NameWrapper if parent is wrapped
  const parentWrapped = await isWrapped(parentName);

  let subTx: Hex;
  if (parentWrapped) {
    // Inherit parent's expiry so the subname appears as a wrapped name in the ENS app.
    const [, , parentExpiry] = await publicClient.readContract({
      address: NAME_WRAPPER,
      abi: NAME_WRAPPER_ABI,
      functionName: "getData",
      args: [BigInt(parentNode)],
    });

    subTx = await walletClient.writeContract({
      address: NAME_WRAPPER,
      abi: NAME_WRAPPER_ABI,
      functionName: "setSubnodeRecord",
      args: [
        parentNode,
        subLabel,       // NameWrapper takes label string, not labelHash
        account.address,
        PUBLIC_RESOLVER,
        0n,             // ttl
        0,              // fuses — 0 = no fuses burned
        parentExpiry,   // inherit parent expiry → subname shows up in ENS app
      ],
    });
  } else {
    // Legacy registry.setSubnodeRecord
    subTx = await walletClient.writeContract({
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
  }
  txHashes.push(subTx);
  await publicClient.waitForTransactionReceipt({ hash: subTx });

  // setAddr + setText run in the background so the HTTP response returns fast.
  // The subname is created on-chain; records follow within ~1 min.
  void (async () => {
    try {
      // 2. setAddr — point the name to the wallet
      const addr = walletAddr ?? account.address;
      const addrTx = await walletClient.writeContract({
        address: PUBLIC_RESOLVER,
        abi: RESOLVER_ABI,
        functionName: "setAddr",
        args: [subNode, addr],
      });
      await publicClient.waitForTransactionReceipt({ hash: addrTx });

      // 3. setText — write each record
      for (const [key, value] of Object.entries(records)) {
        if (!value) continue;
        const textTx = await walletClient.writeContract({
          address: PUBLIC_RESOLVER,
          abi: RESOLVER_ABI,
          functionName: "setText",
          args: [subNode, key, value],
        });
        await publicClient.waitForTransactionReceipt({ hash: textTx });
      }
    } catch (err) {
      console.error("[ENS] background record write failed:", (err as Error).message);
    }
  })();

  return { ensName, txHashes, pendingRecords: true };
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
 * Resolve the current owner of an ENS name.
 * Handles both unwrapped names (registry) and NameWrapper-wrapped names.
 */
export async function getOwner(ensName: string): Promise<Address | null> {
  try {
    const node = namehash(normalize(ensName));
    const regOwner = await publicClient.readContract({
      address: ENS_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "owner",
      args: [node],
    });

    // If registry owner IS the NameWrapper, check NameWrapper for the real owner
    if (regOwner.toLowerCase() === NAME_WRAPPER.toLowerCase()) {
      try {
        const nwOwner = await publicClient.readContract({
          address: NAME_WRAPPER,
          abi: NAME_WRAPPER_ABI,
          functionName: "ownerOf",
          args: [BigInt(node)],
        });
        return nwOwner as Address;
      } catch {
        return regOwner as Address;
      }
    }

    return regOwner as Address;
  } catch {
    return null;
  }
}

/**
 * Check whether the operator wallet owns this ENS name.
 * Works for both legacy (unwrapped) and NameWrapper-wrapped names.
 */
export async function ownsName(ensName: string): Promise<boolean> {
  const owner = await getOwner(ensName);
  return owner?.toLowerCase() === account.address.toLowerCase();
}

/**
 * Check if a name is wrapped in the NameWrapper.
 */
async function isWrapped(ensName: string): Promise<boolean> {
  try {
    const node = namehash(normalize(ensName));
    const regOwner = await publicClient.readContract({
      address: ENS_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "owner",
      args: [node],
    });
    return regOwner.toLowerCase() === NAME_WRAPPER.toLowerCase();
  } catch {
    return false;
  }
}
