/**
 * One-time Lit Chipotle setup: create PKP + usage API key.
 * Requires LIT_CHIPOTLE_ACCOUNT_KEY (master key from dashboard.chipotle.litprotocol.com).
 *
 * Usage:
 *   npm run setup-lit
 */

const BASE = "https://api.chipotle.litprotocol.com/core/v1";
const ACCOUNT_KEY = process.env.LIT_CHIPOTLE_ACCOUNT_KEY;

if (!ACCOUNT_KEY) {
  console.error("❌ LIT_CHIPOTLE_ACCOUNT_KEY not set.");
  console.error("   1. Go to https://dashboard.chipotle.litprotocol.com/dapps/dashboard/");
  console.error("   2. Create account + fund ($5 min via Stripe)");
  console.error("   3. Copy your account key and set LIT_CHIPOTLE_ACCOUNT_KEY=<key>");
  process.exit(1);
}

const headers = { "X-Api-Key": ACCOUNT_KEY, "Content-Type": "application/json" };

async function post(path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`, { method: "GET", headers });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log("\n=== Lit Chipotle Setup ===\n");

  // 1. Create PKP (wallet that holds the encryption key)
  console.log("Creating PKP wallet...");
  const wallet = await post("/create_wallet");
  const pkpId = wallet.wallet_id;
  console.log("✅ PKP created:");
  console.log("   wallet_id (LIT_CHIPOTLE_PKP_ID):", pkpId);
  console.log("   wallet_address:", wallet.wallet_address);

  // 2. Create a group
  console.log("\nCreating group...");
  await post("/add_group", { group_name: "sail-encryption" });
  const groups = await get("/list_groups?page_number=0&page_size=10");
  const group = groups[groups.length - 1];
  console.log("✅ Group created:", group.id, group.name ?? group.group_name);

  // 3. Add PKP to group
  console.log("\nAdding PKP to group...");
  await post("/add_pkp_to_group", { group_id: group.id, pkp_id: pkpId });
  console.log("✅ PKP added to group");

  // 4. Create usage API key scoped to the group
  console.log("\nCreating usage API key...");
  const usageKey = await post("/add_usage_api_key", {
    name: "sail-backend",
    execute_in_groups: [group.id],
  });
  const apiKey = usageKey.usage_api_key;
  console.log("✅ Usage API key created (shown once — save it now!):");
  console.log("   LIT_CHIPOTLE_API_KEY:", apiKey);

  console.log("\n=== Add to backend/.env ===");
  console.log(`LIT_CHIPOTLE_API_KEY=${apiKey}`);
  console.log(`LIT_CHIPOTLE_PKP_ID=${pkpId}`);
  console.log("\nThen restart the backend — Chipotle encryption will be active.\n");
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});

export {};
