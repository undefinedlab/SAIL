/**
 * @lit-protocol/crypto (E2EE) uses `Buffer.alloc(8).writeBigUInt64BE`.
 * Next/Turbopack often provides an incomplete Buffer in the client bundle; Lit may also get a
 * separate `require("buffer")` resolution. We always install the real npm `buffer` on `globalThis`
 * in the browser before any Lit code runs.
 */
import { Buffer as BufferImpl } from "buffer";

if (typeof window !== "undefined") {
  (globalThis as typeof globalThis & { Buffer: typeof BufferImpl }).Buffer = BufferImpl;
}

export {};
