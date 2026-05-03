"use client";

import { ScrollReveal } from "./ScrollReveal";

export function CTASection() {
  return (
    <section
      id="contact"
      data-oci-cursor="on-light"
      className="bg-[#f5f5f0] py-[120px] md:py-[160px]"
    >
      <div className="mx-auto max-w-[1440px] px-6">
        <ScrollReveal>
          <div>
            <h2 className="text-[clamp(38px,5vw,68px)] font-black leading-[0.95] tracking-[-0.02em] text-[#05058a]">
              Add SAIL to your flow
            </h2>
            <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:items-start">
              <div className="overflow-hidden rounded-xl border border-[#05058a]/20 bg-[#05058a] p-5 md:p-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">MCP config</p>
                <pre className="mt-4 overflow-x-auto text-[12px] leading-relaxed text-white/90">
{`{
  "mcpServers": {
    "sail": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "$",
      "env": {
        "DOTENV_CONFIG_PATH": ".env.local"
      }
    },
    "sail-production": {
      "url": "https://content-essence-production-3635.up.railway.app/mcp"
    }
  
}

}`}
                </pre>
              </div>

              <div className="text-left">
                <p className="mt-5 max-w-[44ch] text-sm font-light leading-relaxed text-[#05058a]/75">
                  Add SAIL once in MCP, then expand from calls to tools to full agent workflows with verifiable
                  commit-before-execute checks.
                </p>
                <p className="mt-5 text-[12px] font-medium tracking-[-0.01em] text-[#05058a]/75">
                  <span className="text-[#05058a]">think_with_sail()</span>,{" "}
                  <span className="text-[#05058a]">audit_with_sail()</span>,{" "}
                  <span className="text-[#05058a]">delegate_with_sail()</span>
                </p>
                <p className="mt-6 text-[12px] font-medium uppercase tracking-[0.16em] text-[#05058a]/65">
                  Keep your flow. Add accountability.
                </p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
