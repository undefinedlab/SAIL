"use client";

import { ScrollReveal } from "./ScrollReveal";

export function CTASection() {
  return (
    <section
      id="contact"
      data-oci-cursor="on-dark"
      className="bg-[#2020e8] py-[120px] md:py-[160px]"
    >
      <div className="mx-auto max-w-[1440px] px-6">
        <ScrollReveal>
          <div className="mx-auto max-w-[720px] text-center">
            <h2 className="text-[clamp(40px,6vw,80px)] font-black leading-none tracking-[-0.02em] text-white">
              Add SAIL to your MCP flow
            </h2>
            <p className="mt-6 text-sm font-light text-white/80">
              Drop in one server and expose SAIL tools to your agent runtime.
            </p>

            <div className="mt-10 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85">
                Add SAIL MCP to your agent stack
              </p>
              <p className="mt-2 text-sm font-light text-white/75">
                Works with Cursor, Claude, and MCP-native agent frameworks.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="border border-white/20 bg-white/10 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/85">
                    Cursor
                  </p>
                  <pre className="mt-3 overflow-x-auto text-[12px] leading-relaxed text-white/90">
                    <code>{`{
  "mcpServers": {
    "sail": {
      "command": "npx",
      "args": [
        "-y", "@sail/mcp-server",
        "--ens=myagent.sail.eth",
        "--stake=0.1",
        "--tier=optimistic"
      ]
    }
  }
}`}</code>
                  </pre>
                </div>

                <div className="border border-white/20 bg-white/10 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/85">
                    Claude
                  </p>
                  <pre className="mt-3 overflow-x-auto text-[12px] leading-relaxed text-white/90">
                    <code>{`{
  "mcpServers": {
    "sail": {
      "command": "npx",
      "args": [
        "-y", "@sail/mcp-server",
        "--ens=myagent.sail.eth",
        "--stake=0.1",
        "--tier=optimistic"
      ]
    }
  }
}`}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
