import { expect, test, type Page } from "@playwright/test";
import { Keypair, TransactionMessage, VersionedTransaction } from "@solana/web3.js";

const TOKEN = "test-token-123456";
const MINT = "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump";
const MINT_TWO = `${MINT.slice(0, -1)}o`;

function curve(mint: string, progress: number) {
  return {
    mint,
    curve: {
      mint,
      curve: `curve-${mint.slice(0, 4)}`,
      creator: `creator-${mint.slice(0, 4)}`,
      complete: false,
      graduationProgress: progress,
      quote: { symbol: "SOL", decimals: 9 },
      priceInQuote: 0.0000001,
      marketCapInQuote: 42,
      initialVirtualQuote: "30",
      isMayhemMode: false,
      reserves: { realQuote: "12.5", realTokens: "500000000", virtualQuote: "42.5", virtualTokens: "780000000", totalSupply: "1000000000" },
      bondingCurve: "6ZL7AWEfcWkLjgGo8jTWVG1mSgWfoWeRcdFyzRdfPgUS",
      creatorFeeBps: 5,
      tradesOn: "pump",
      buyQuote: { tokensOut: "123456", quoteIn: 0.1 },
    },
  };
}

function preview(publicKey: string) {
  const transaction = new VersionedTransaction(new TransactionMessage({
    payerKey: Keypair.generate().publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [],
  }).compileToV0Message());
  return {
    transaction: Buffer.from(transaction.serialize()).toString("base64"),
    encoding: "base64",
    bytes: transaction.serialize().length,
    action: "buy",
    venue: "pump",
    mint: MINT,
    quote: { quoteSymbol: "SOL", quoteIn: 0.05, tokensOut: "123456", slippagePct: 10 },
    requiredSigners: [publicKey],
    signedBy: [],
    lastValidBlockHeight: 100,
    lookupTablesUsed: [],
    note: "Test unsigned transaction.",
  };
}

async function mocks(page: Page, toolResponse?: (code: string) => unknown) {
  await page.route("**/health", (route) => route.fulfill({ json: {
    ok: true, version: "0.2.0", mode: "community", officialKey: false, rpc: true,
    metadataUpload: false, devBuyInCreate: false, auth: true, cluster: "devnet",
  } }));
  await page.route("**/api/showcase", (route) => route.fulfill({ json: { ...curve(MINT, 0.64).curve, asOf: new Date(Date.now() - 12_000).toISOString() } }));
  await page.route("**/openapi.json", (route) => route.fulfill({ json: { paths: {
    "/curve/{mint}": { get: { summary: "Read bonding curve", tags: ["chain"], security: [] } },
    "/trade": { post: { summary: "Build unsigned trade", tags: ["trading"], requestBody: { content: {} } } },
  } } }));
  await page.route("https://api.github.com/**", (route) => route.abort());
  await page.route("**/mcp", async (route) => {
    const request = route.request().postDataJSON() as { id?: number; method: string; params?: { arguments?: { code?: string } } };
    if (request.method === "initialize") {
      return route.fulfill({ json: { jsonrpc: "2.0", id: request.id, result: {} }, headers: { "mcp-session-id": "e2e" } });
    }
    if (request.method === "notifications/initialized") return route.fulfill({ json: {} });
    const code = request.params?.arguments?.code ?? "";
    const payload = toolResponse?.(code) ?? { ok: true };
    return route.fulfill({ json: { jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: JSON.stringify(payload) }] } } });
  });
}

async function unlock(page: Page) {
  if (await page.getByLabel("Bearer token").count() === 0) await page.getByRole("button", { name: "Operator unlock", exact: true }).click();
  await page.getByLabel("Bearer token").fill(TOKEN);
  await page.getByRole("button", { name: "Unlock operator mode" }).click();
  await expect(page.getByLabel("Bearer token")).toHaveCount(0);
}

async function mockWallet(page: Page, address: string) {
  await page.addInitScript(({ address }) => {
    const account = {
      address,
      publicKey: new Uint8Array(32),
      chains: ["solana:devnet"],
      features: ["standard:connect", "solana:signTransaction"],
    };
    const wallet = {
      version: "1.0.0",
      name: "E2E Wallet",
      icon: "data:image/svg+xml;base64,PHN2Zy8+",
      chains: ["solana:devnet"],
      accounts: [],
      features: {
        "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
        "standard:disconnect": { version: "1.0.0", disconnect: async () => {} },
        "standard:events": { version: "1.0.0", on: () => () => {} },
        "solana:signTransaction": {
          version: "1.0.0",
          supportedTransactionVersions: [0, "legacy"],
          signTransaction: async (...inputs: Array<{ transaction: Uint8Array }>) => inputs.map((input) => ({ signedTransaction: input.transaction })),
        },
      },
    };
    window.addEventListener("wallet-standard:app-ready", (event) => {
      (event as CustomEvent<{ register: (value: unknown) => void }>).detail.register(wallet);
    });
    window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", {
      detail: (api: { register: (value: unknown) => void }) => api.register(wallet),
    }));
  }, { address });
}

test("opens a public demo, then unlocks and locks operator mode", async ({ page }) => {
  await mocks(page);
  await page.goto("/app/coins");
  await expect(page.getByText("Explore Pump MCP—no token needed.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Explore the live showcase." })).toBeVisible();
  await expect(page.getByLabel("Bearer token")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Trade this coin" })).toBeVisible();
  await page.getByRole("button", { name: "Operator unlock", exact: true }).click();
  await expect(page.getByLabel("Bearer token")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Bearer token")).toHaveCount(0);
  await unlock(page);
  await expect(page.getByRole("heading", { name: "Inspect a bonding curve." })).toBeVisible();
  const storage = await page.evaluate(() => ({ local: localStorage.getItem("pump-mcp-token"), session: sessionStorage.getItem("pump-mcp-session-token") }));
  expect(storage).toEqual({ local: null, session: TOKEN });
  await page.getByRole("button", { name: "Lock session" }).click();
  await expect(page.getByText("Explore Pump MCP—no token needed.")).toBeVisible();
  await expect(page.getByLabel("Bearer token")).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("pump-mcp-session-token"))).toBeNull();
});

test("shows the public showcase as live, linked chain data", async ({ page }) => {
  let showcaseReads = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/showcase") showcaseReads++; });
  await mocks(page);
  await page.goto("/app/coins");
  await expect(page.getByText(/live · 1\ds ago/)).toBeVisible();
  await expect(page.getByLabel("Mint addresses")).toHaveCount(0);
  await expect(page.getByText("12.5 / 85 SOL")).toBeVisible();
  await expect(page.getByText("0.1 SOL → 123.5k tokens")).toBeVisible();
  await expect(page.getByText("500.00M")).toBeVisible();
  await expect(page.getByText("0.05%")).toBeVisible();
  await expect(page.getByRole("link", { name: "6ZL7…PgUS ↗" })).toHaveAttribute("href", "https://solscan.io/account/6ZL7AWEfcWkLjgGo8jTWVG1mSgWfoWeRcdFyzRdfPgUS?cluster=devnet");
  await expect(page.getByRole("link", { name: "pump.fun ↗" })).toHaveCount(0); // the mocked deployment is devnet
  await expect(page.getByRole("link", { name: "Solscan ↗" })).toHaveAttribute("href", `https://solscan.io/token/${MINT}?cluster=devnet`);
  const before = showcaseReads;
  await page.getByRole("button", { name: "Refresh now" }).click();
  await expect.poll(() => showcaseReads).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Search any coin →" }).click();
  await expect(page.getByLabel("Bearer token")).toBeFocused();
});

test("runs sample playground and workflow demos with zero MCP requests", async ({ page }) => {
  let mcpRequests = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/mcp") mcpRequests++; });
  await mocks(page);
  await page.goto("/app/playground");
  await page.getByRole("button", { name: "Show sample result" }).click();
  await expect(page.getByText("sample result · no network calls")).toBeVisible();
  await expect(page.locator("pre.out")).toContainText('"sample": true');
  await page.locator('nav a[href="/app/trade"]').click();
  await expect(page.getByRole("button", { name: "Operator unlock required to build" })).toBeDisabled();
  await page.locator('nav a[href="/app/launch"]').click();
  await expect(page.getByRole("button", { name: "Operator unlock required to pin and launch" })).toBeDisabled();
  expect(mcpRequests).toBe(0);
});

test("explains the app publicly with plain-language help and diagrams", async ({ page }) => {
  let mcpRequests = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/mcp") mcpRequests++; });
  await mocks(page);
  await page.goto("/app/help");
  await expect(page.getByRole("heading", { name: "New here? Start with this." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Which mode am I using?" })).toBeVisible();
  await expect(page.getByText("Most people should use the demo.")).toBeVisible();
  await expect(page.getByRole("img", { name: /AI assistant asks Pump MCP/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Transaction steps: preview/ })).toBeVisible();
  await page.getByRole("button", { name: "Explore a live coin" }).click();
  await expect(page.getByRole("heading", { name: "Explore the live showcase." })).toBeVisible();
  await page.getByRole("link", { name: "How it works" }).click();
  await expect(page.getByRole("heading", { name: "New here? Start with this." })).toBeVisible();
  expect(mcpRequests).toBe(0);
});

test("compares coins in one call and records safe activity metadata", async ({ page }) => {
  await mocks(page, () => [curve(MINT, 0.42), curve(MINT_TWO, 0.75)]);
  await page.goto("/app/coins");
  await unlock(page);
  await page.getByLabel("Mint addresses").fill(`${MINT}\n${MINT_TWO}`);
  await page.getByRole("button", { name: /Read curves|Refresh curves/ }).click();
  await expect(page.getByText("2 coins · one tool call")).toBeVisible();
  await expect(page.getByText("75%")).toBeVisible();
  await page.locator('nav a[href="/app/activity"]').click();
  await expect(page.getByText("Compare 2 coins")).toBeVisible();
  await expect(page.getByText("completed requests")).toBeVisible();
});

test("shows a per-mint error for a single failed curve read", async ({ page }) => {
  await mocks(page, () => [{ mint: MINT, error: "No bonding curve account" }]);
  await page.goto("/app/coins");
  await unlock(page);
  await page.getByLabel("Mint addresses").fill(MINT);
  await page.getByRole("button", { name: /Read curves|Refresh curves/ }).click();
  await expect(page.getByText("Curve read failed for")).toBeVisible();
  await expect(page.getByText("No bonding curve account")).toBeVisible();
});

test("previews, simulates, wallet-signs, submits, and confirms a trade", async ({ page }) => {
  const payer = Keypair.generate().publicKey.toBase58();
  await mockWallet(page, payer);
  await mocks(page, (code) => {
    if (code.includes('path: "/trade"')) return preview(payer);
    if (code.includes("simulateTransaction")) return { value: { err: null, logs: ["Program ok"] } };
    if (code.includes("sendTransaction")) return "e2e-signature";
    if (code.includes("getSignatureStatuses")) return { status: { confirmationStatus: "confirmed" }, currentLastValidBlockHeight: 100 };
    return {};
  });
  await page.goto("/app/trade");
  await unlock(page);
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByLabel("Injected wallet").selectOption("E2E Wallet");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByLabel("Token mint").fill(MINT);
  await page.getByRole("button", { name: "Build transaction preview" }).click();
  await expect(page.getByRole("heading", { name: "buy on bonding curve" })).toBeVisible();
  await page.getByRole("button", { name: "Simulate transaction" }).click();
  await expect(page.getByText("Simulation returned no execution error.")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Sign and submit" }).click();
  await expect(page.getByText("confirmed", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "View transaction on Solscan" })).toHaveAttribute("href", "https://solscan.io/tx/e2e-signature?cluster=devnet");
});

test("shows launch configuration limits and filters the API inspector", async ({ page }) => {
  await mocks(page);
  await page.goto("/app/launch");
  await unlock(page);
  await expect(page.getByText("PINATA_JWT is not configured.")).toBeVisible();
  await page.getByLabel("Developer buy SOL").fill("0.1");
  await expect(page.getByText("A nonzero developer buy needs LOOKUP_TABLES.")).toBeVisible();
  await page.locator('nav a[href="/app/api"]').click();
  await expect(page.getByRole("heading", { name: "Explore the entire route surface." })).toBeVisible();
  await page.getByRole("textbox", { name: "Search API operations" }).fill("trade");
  await expect(page.getByText("1 operations")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Build unsigned trade" })).toBeVisible();
});

test("keeps console navigation usable on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mocks(page);
  await page.goto("/app/coins");
  await unlock(page);
  await expect(page.locator("nav").getByRole("link", { name: "Coins" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
});
