import "./ensure-node-buffer";
import { createLitClient } from "@lit-protocol/lit-client";
import { generateSessionKeyPair } from "@lit-protocol/crypto";
import {
  getHashedAccessControlConditions,
  validateAccessControlConditions,
} from "@lit-protocol/access-control-conditions";
import {
  createSiweMessage,
  generateAuthSig,
  LitAccessControlConditionResource,
} from "@lit-protocol/auth-helpers";
import { uint8arrayToString } from "@lit-protocol/uint8arrays";
import { SessionKeyUriSchema } from "@lit-protocol/schemas";
import { LIT_ABILITY } from "@lit-protocol/constants";
import { getAddress, type Address } from "viem";
import { resolveLitNetworkModule } from "./lit-network-public";

export type EncryptedKey = {
  ciphertext: string;
  dataToEncryptHash: string;
};

export type SealedPayload = {
  cid: string;
  encryptedKey: EncryptedKey;
  iv: string;
};

let litClientPromise: Promise<Awaited<ReturnType<typeof createLitClient>>> | null = null;

function getLitClient() {
  if (!litClientPromise) {
    litClientPromise = createLitClient({ network: resolveLitNetworkModule() });
  }
  return litClientPromise;
}

/** Must stay in sync with `backend/storage/lit.ts` `stakerCondition`. */
function stakerCondition(address: string) {
  return [
    {
      conditionType: "evmBasic" as const,
      contractAddress: "",
      standardContractType: "" as const,
      chain: "sepolia" as const,
      method: "",
      parameters: [":userAddress"],
      returnValueTest: { comparator: "=" as const, value: address.toLowerCase() },
    },
  ];
}

async function accResourceIdFromEncryptedKey(
  accs: ReturnType<typeof stakerCondition>,
  dataToEncryptHash: string,
): Promise<string> {
  const accParams = { accessControlConditions: accs };
  await validateAccessControlConditions(accParams);
  const buf = await getHashedAccessControlConditions(accParams);
  if (!buf) throw new Error("Failed to hash access control conditions");
  const hashHex = uint8arrayToString(new Uint8Array(buf), "base16");
  const dataHex = dataToEncryptHash.trim().toLowerCase();
  return `${hashHex}/${dataHex}`;
}

async function signSiweRecapAuth(
  walletAddress: Address,
  signMessage: (message: string) => Promise<string>,
  accResource: InstanceType<typeof LitAccessControlConditionResource>,
  sessionKeyPair: { publicKey: string; secretKey: string },
) {
  const expiration = new Date(Date.now() + 1000 * 60 * 60).toISOString();
  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  const nonce = `0x${Array.from(nonceBytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  const resources = [{ resource: accResource, ability: LIT_ABILITY.AccessControlConditionDecryption }];
  const uri = SessionKeyUriSchema.parse(sessionKeyPair.publicKey);
  const checksumAddr = getAddress(walletAddress);

  const toSign = await createSiweMessage({
    walletAddress: checksumAddr,
    chainId: 11155111,
    expiration,
    nonce,
    statement: "SEAL Protocol — access-control decryption",
    domain: "seal-protocol.io",
    uri,
    version: "1",
    resources,
  });

  const signer = {
    signMessage: (msg: string) => signMessage(msg),
    getAddress: async () => checksumAddr,
  };
  // auth-helpers expects an ethers-like signer; wagmi personal_sign matches `signMessage(message)`.
  return generateAuthSig({ signer: signer as { signMessage: (m: string) => Promise<string>; getAddress: () => Promise<string> }, toSign, address: checksumAddr });
}

async function litDecryptAuthContext(
  encryptedKey: EncryptedKey,
  conditionAddress: Address,
  signMessage: (message: string) => Promise<string>,
) {
  const sessionKeyPair = generateSessionKeyPair();
  const addr = getAddress(conditionAddress);
  const accs = stakerCondition(addr);
  const resourceId = await accResourceIdFromEncryptedKey(accs, encryptedKey.dataToEncryptHash);
  const accResource = new LitAccessControlConditionResource(resourceId);
  const resourceAbilityRequests = [
    { resource: accResource, ability: LIT_ABILITY.AccessControlConditionDecryption },
  ];
  const expiration = new Date(Date.now() + 1000 * 60 * 60).toISOString();

  // Lit calls `authNeededCallback` many times per decrypt (nodes / internal retries). Without deduping,
  // each call used a fresh nonce → endless MetaMask popups. Reuse one SIWE for this decrypt session.
  let siweAuthInflight: ReturnType<typeof signSiweRecapAuth> | null = null;
  const authNeededCallback = () => {
    if (!siweAuthInflight) {
      siweAuthInflight = signSiweRecapAuth(addr, signMessage, accResource, sessionKeyPair);
    }
    return siweAuthInflight;
  };

  return {
    chain: "sepolia" as const,
    sessionKeyPair,
    authNeededCallback,
    authConfig: {
      capabilityAuthSigs: [] as [],
      expiration,
      statement: "SEAL Protocol — access-control decryption",
      domain: "seal-protocol.io",
      resources: resourceAbilityRequests,
    },
    resourceAbilityRequests,
  };
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** AES-256-GCM: ciphertext then 16-byte tag (same layout as Node `backend/storage/lit.ts`). */
async function decryptAesGcm(encrypted: ArrayBuffer, key: Uint8Array, iv: Uint8Array): Promise<string> {
  const u8 = new Uint8Array(encrypted);
  const keyRaw = new Uint8Array(key.byteLength);
  keyRaw.set(key);
  const ivRaw = new Uint8Array(iv.byteLength);
  ivRaw.set(iv);
  const cryptoKey = await crypto.subtle.importKey("raw", keyRaw, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivRaw, tagLength: 128 }, cryptoKey, u8);
  return new TextDecoder().decode(plain);
}

async function fetchEncryptedBlob(cid: string): Promise<ArrayBuffer> {
  const gateways = [
    `https://${cid}.ipfs.w3s.link`,
    `https://ipfs.io/ipfs/${cid}`,
    `https://dweb.link/ipfs/${cid}`,
  ];
  let lastErr: Error | null = null;
  for (const url of gateways) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 30000);
      const res = await fetch(url, { signal: controller.signal });
      window.clearTimeout(timer);
      if (!res.ok) throw new Error(`${url}: ${res.statusText}`);
      return await res.arrayBuffer();
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw new Error(`Failed to fetch sealed blob: ${lastErr?.message}`);
}

/**
 * Unwrap Lit DEK with the connected wallet (SIWE prompts), fetch CID from gateways, AES-GCM decrypt.
 * Caller must use the same address passed as `authorizedAddress` when the blob was sealed.
 */
export async function decryptSealedBlobInBrowser(
  sealed: SealedPayload,
  walletAddress: Address,
  signMessage: (message: string) => Promise<string>,
): Promise<string> {
  const lit = await getLitClient();
  const addr = getAddress(walletAddress);
  const ctx = await litDecryptAuthContext(sealed.encryptedKey, addr, signMessage);

  const { decryptedData } = await lit.decrypt({
    ciphertext: sealed.encryptedKey.ciphertext,
    dataToEncryptHash: sealed.encryptedKey.dataToEncryptHash,
    accessControlConditions: stakerCondition(addr),
    chain: "sepolia",
    authContext: {
      chain: ctx.chain,
      sessionKeyPair: ctx.sessionKeyPair,
      authNeededCallback: ctx.authNeededCallback,
      authConfig: ctx.authConfig,
    },
  });

  const aesKey = new Uint8Array(decryptedData);
  const iv = hexToBytes(sealed.iv);
  const encryptedBytes = await fetchEncryptedBlob(sealed.cid);
  return decryptAesGcm(encryptedBytes, aesKey, iv);
}
