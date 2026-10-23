import { expect, type BrowserContext, type Page } from "@playwright/test";
import type { Envelope } from "../../src/core/crypto";
export type Snapshot = {
  id: string;
  name: string;
  createdTime: string;
  envelope: Envelope;
};
const accounts = new WeakMap<
  Snapshot[],
  { header?: Record<string, unknown> }
>();
export const testAccountId = "b7282c5c-3f46-49ec-93ce-06ba580310b1";
export async function mockCloud(
  context: BrowserContext,
  operations: Snapshot[] = [],
  userId = testAccountId,
) {
  let state = accounts.get(operations);
  if (!state) {
    state = {};
    accounts.set(operations, state);
  }
  const shared = state;
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.invalid",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  const base64 = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${base64({ alg: "HS256", typ: "JWT" })}.${base64({ sub: userId, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.TEST_ONLY_SIGNATURE`;
  const session = {
    access_token: token,
    refresh_token: "TEST_ONLY_REFRESH_TOKEN",
    token_type: "bearer",
    expires_in: 3600,
    user,
  };
  await context.addInitScript(() =>
    localStorage.setItem(
      "myhorizon-cloud-config-v1",
      JSON.stringify({
        url: "https://myhorizon-test.supabase.co",
        key: "sb_publishable_TEST_ONLY_NOT_A_REAL_KEY",
      }),
    ),
  );
  await context.route(
    "https://myhorizon-test.supabase.co/**",
    async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/auth/v1/user")
        return route.fulfill({ json: user });
      if (url.pathname === "/auth/v1/token")
        return route.fulfill({ json: session });
      if (
        url.pathname === "/auth/v1/logout" ||
        url.pathname === "/auth/v1/recover"
      )
        return route.fulfill({ json: {} });
      if (url.pathname === "/auth/v1/signup")
        return route.fulfill({ json: { user, session: null } });
      if (url.pathname === "/auth/v1/authorize") {
        const redirect = url.searchParams.get("redirect_to")!;
        return route.fulfill({
          status: 302,
          headers: { location: `${redirect}?code=TEST_ONLY_PKCE_CODE` },
          body: "",
        });
      }
      if (url.pathname === "/rest/v1/rpc/horizon_bootstrap")
        return route.fulfill({
          json: shared.header
            ? {
                header: shared.header,
                vault_id: shared.header.vaultId,
                operations: [],
                cursor: 0,
                has_more: operations.length > 0,
              }
            : null,
        });
      if (url.pathname === "/rest/v1/rpc/horizon_exchange") {
        const body = route.request().postDataJSON();
        if (shared.header && shared.header.vaultId !== body.p_vault_id)
          return route.fulfill({
            status: 409,
            json: { message: "Conta já possui outro cofre" },
          });
        shared.header ??= body.p_header;
        for (const operation of body.p_operations) {
          const old = operations.find((r) => r.id === operation.op_id);
          if (
            old &&
            JSON.stringify(old.envelope) !== JSON.stringify(operation.payload)
          )
            return route.fulfill({
              status: 409,
              json: { message: "Operation collision" },
            });
          if (!old)
            operations.push({
              id: operation.op_id,
              name: "encrypted-operation",
              createdTime: new Date().toISOString(),
              envelope: operation.payload,
            });
        }
        const page = operations.slice(
          body.p_cursor,
          body.p_cursor + body.p_limit,
        );
        const cursor = body.p_cursor + page.length;
        return route.fulfill({
          json: {
            header: shared.header,
            operations: page.map((r, i) => ({
              op_id: r.id,
              seq: body.p_cursor + i + 1,
              payload: r.envelope,
            })),
            cursor,
            has_more: cursor < operations.length,
          },
        });
      }
      return route.fulfill({
        status: 400,
        json: { message: `Unexpected test endpoint: ${url.pathname}` },
      });
    },
  );
  return { operations, userId };
}
export async function signInAccount(page: Page) {
  await page.getByLabel("E-mail", { exact: true }).fill("test@example.invalid");
  await page
    .getByLabel("Senha da conta", { exact: true })
    .fill("TEST_ONLY_ACCOUNT_PASSWORD");
  await page
    .getByRole("button", { name: "Entrar na minha conta", exact: true })
    .click();
  await expect(
    page.getByLabel("Senha-mestra", { exact: false }).first(),
  ).toBeVisible();
}
