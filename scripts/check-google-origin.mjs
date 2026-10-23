import { chromium } from "@playwright/test";
// Read-only configuration diagnostic. Actual Google/SMTP validation requires the owner's server.
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const url = process.env.F5_PREVIEW_URL || "http://localhost:5173";
  const response = await page.goto(url);
  const google = page.getByRole("button", { name: "Continuar com Google", exact: true });
  await google.waitFor();
  console.log(JSON.stringify({
    HTTP: response.status(), origin: new URL(url).origin,
    expectedWebCallback: `${new URL(url).origin}/auth/callback`,
    googleLoginConfigured: await google.isEnabled(),
    independentAccount: await page.getByRole("button", { name: "Entrar na minha conta", exact: true }).isVisible(),
    liveGoogleAuthenticationVerified: false,
    nextStep: "Configure Supabase Auth, Google provider and allowed redirects; validate with your own account. See docs/INDEPENDENCIA.md.",
  }));
} finally { await browser.close(); }
