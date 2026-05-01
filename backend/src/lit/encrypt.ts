/**
 * Lit Protocol — server-side encryption for SAIL commitment blobs.
 *
 * Encryption flow:
 *   1. MCP / API server receives plaintext commitment blob.
 *   2. Encrypt via Lit with access conditions tied to the SAIL contract's
 *      isAuthorized(auditor, ens) function.
 *   3. Resulting ciphertext is uploaded to 0G Storage.
 *   4. Auditor browser-side later requests Lit decryption — Lit nodes call
 *      isAuthorized() and only release the key share if the contract returns true.
 *
 * The frontend (sail-reveal-client.ts) handles the matching decryption.
 */

import { LitNodeClientNodeJs } from "@lit-protocol/lit-node-client-nodejs";
import { LIT_NETWORK } from "@lit-protocol/constants";
import { env } from "../config/env.js";

let clientPromise: Promise<LitNodeClientNodeJs> | null = null;

function resolveNetwork(): keyof typeof LIT_NETWORK | string {
  return env.lit.network;
}

function getClient(): Promise<LitNodeClientNodeJs> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new LitNodeClientNodeJs({
        litNetwork: resolveNetwork() as never,
        debug: false,
      });
      await client.connect();
      return client;
    })();
  }
  return clientPromise;
}

export type SailAccessConditions = ReturnType<typeof sailAccessConditions>;

/**
 * Access conditions: only addresses for which `isAuthorized(addr, ens) == true`
 * on the SAIL contract are allowed to decrypt this blob.
 */
export function sailAccessConditions(agentEns: string) {
  return [
    {
      conditionType: "evmContract" as const,
      contractAddress: env.sail.contractAddress,
      chain: "sepolia" as const,
      functionName: "isAuthorized",
      functionParams: [":userAddress", agentEns],
      functionAbi: {
        name: "isAuthorized",
        type: "function",
        stateMutability: "view",
        inputs: [
          { name: "auditor", type: "address" },
          { name: "ens", type: "string" },
        ],
        outputs: [{ name: "", type: "bool" }],
      },
      returnValueTest: { key: "", comparator: "=" as const, value: "true" },
    },
  ];
}

export type EncryptedBlob = {
  ciphertext: string;
  dataToEncryptHash: string;
  accessConditions: SailAccessConditions;
};

/**
 * Encrypt a plaintext commitment blob with Lit Protocol.
 * The returned ciphertext is what gets uploaded to 0G Storage.
 */
export async function encryptCommitmentBlob(
  plaintext: Uint8Array,
  agentEns: string,
): Promise<EncryptedBlob> {
  const client = await getClient();
  const accessConditions = sailAccessConditions(agentEns);

  const { ciphertext, dataToEncryptHash } = await client.encrypt({
    evmContractConditions: accessConditions as never,
    dataToEncrypt: plaintext,
  });

  return { ciphertext, dataToEncryptHash, accessConditions };
}
