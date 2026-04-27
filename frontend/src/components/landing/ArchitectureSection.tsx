const layers = [
  {
    layer: "Runtime",
    component: "TEE agent runtime",
    role:
      "TypeScript agent in AWS Nitro Enclave: LLM, reasoning validation, blob encryption, attestation.",
  },
  {
    layer: "Staking",
    component: "Runtime verification stake",
    role:
      "Agents register via NEAR credential NFT tied to runtime hash — bad actors lose market access and stake.",
  },
  {
    layer: "Contract",
    component: "SAIL smart contract (EVM)",
    role:
      "Solidity on Base / Arbitrum: commit-before-execute, merkle roots, attestation validation, proposals.",
  },
  {
    layer: "Storage",
    component: "Encrypted IPFS layer",
    role:
      "Reasoning blobs encrypted (AES-256), pinned to Filecoin / Storacha; Lit manages decryption keys.",
  },
  {
    layer: "Vault",
    component: "Credential vault",
    role: "Agent API keys in Lit — prove tool access without exposing credentials to others.",
  },
  {
    layer: "Reveal",
    component: "Selective reveal UI",
    role:
      "Authorized parties request decryption, verify on-chain commitment vs blob, confirm TEE attestation.",
  },
];

export function ArchitectureSection() {
  return (
    <section id="architecture" className="scroll-mt-16 border-b border-[var(--border)] px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="sail-section-label">Architecture</p>
        <h2 className="font-display mt-4 max-w-3xl text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl lg:text-[2.75rem]">
          Stack at a glance
        </h2>
        <div className="mt-12 overflow-x-auto border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-alt)]">
                <th className="px-5 py-4 font-sans text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Layer
                </th>
                <th className="px-5 py-4 font-sans text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Component
                </th>
                <th className="px-5 py-4 font-sans text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Role
                </th>
              </tr>
            </thead>
            <tbody>
              {layers.map((row) => (
                <tr key={row.component} className="border-b border-[var(--border)] last:border-0">
                  <td className="whitespace-nowrap px-5 py-4 font-medium text-[var(--accent-subtle)]">
                    {row.layer}
                  </td>
                  <td className="px-5 py-4 font-medium text-stone-900">{row.component}</td>
                  <td className="px-5 py-4 text-[var(--muted)]">{row.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
