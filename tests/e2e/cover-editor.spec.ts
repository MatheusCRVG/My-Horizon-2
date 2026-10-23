import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from "@playwright/test";
import type { Entity } from "../../src/core/model";
import type { Cover } from "../../src/core/horizons";
import { navigateApp } from "./navigation";
import { beginDirectHorizon, finishDirectHorizon } from "./horizon-wizard";

test.setTimeout(120000);
test.use({ actionTimeout: 12000 });
const password = "cover-test-vault-2026";
const card = (page: Page, name: string) =>
  page
    .locator(".horizon-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
const zoomOutput = (dialog: Locator) =>
  dialog.getByLabel("Zoom da foto", { exact: true });
const areaOf = (dialog: Locator) =>
  dialog.getByRole("group", { name: "Enquadramento da foto", exact: true });

async function start(page: Page, real = false) {
  if (real) {
    await page
      .context()
      .route("https://accounts.google.com/gsi/client", (route) =>
        route.fulfill({
          contentType: "application/javascript",
          body: "window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:()=>c.callback({access_token:'COVER_TEST_ONLY',expires_in:3600})})}}};",
        }),
      );
    await page
      .context()
      .route("https://openidconnect.googleapis.com/v1/userinfo", (route) =>
        route.fulfill({
          json: {
            sub: "cover-test-owner",
            email: "cover@example.invalid",
            name: "Cover Test",
          },
        }),
      );
    await page.context().route("https://www.googleapis.com/**", (route) =>
      route.fulfill({
        json:
          route.request().method() === "POST"
            ? { id: "cover-test-snapshot" }
            : { files: [] },
      }),
    );
  }
  await page.goto("/");
  await page
    .getByRole("button", {
      name: real ? "Usar somente neste dispositivo" : "Explorar com dados fictícios",
      exact: true,
    })
    .click();
  if (real) {
    await page.getByLabel("Senha-mestra", { exact: false }).fill(password);
    await page.getByLabel("Confirme a senha", { exact: false }).fill(password);
    await page
      .getByRole("button", { name: "Criar cofre criptografado", exact: true })
      .click();
    await page
      .getByRole("checkbox", {
        name: "Guardei minha chave em um lugar seguro.",
        exact: true,
      })
      .check();
    await page.getByRole("button", { name: "Começar", exact: true }).click();
  }
  await expect(page.locator("main.page-overview")).toBeVisible();
  await navigateApp(page, "Meus horizontes");
}

async function entities(page: Page): Promise<Entity[]> {
  return page.evaluate(async () => {
    const path = "/src/core/store.ts";
    const resources = [
      ...new Set(
        performance
          .getEntriesByType("resource")
          .map((r) => r.name)
          .filter((url) => new URL(url).pathname === path),
      ),
    ].reverse();
    for (const resource of [...resources, path]) {
      const { useFinance } = await import(resource);
      const doc = useFinance?.getState().doc;
      if (doc) return doc.entities;
    }
    throw Error("O cofre não está desbloqueado.");
  });
}

async function openEditor(page: Page, name = "Próxima viagem") {
  await card(page, name)
    .getByRole("button", { name: "Ver horizonte", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Editar horizonte", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Editar horizonte",
    exact: true,
  });
  await dialog
    .getByRole("group", { name: "Área de edição do horizonte", exact: true })
    .getByRole("button", { name: "Foto de capa", exact: true })
    .click();
  await ready(areaOf(dialog));
  return dialog;
}

async function ready(area: Locator) {
  await area.scrollIntoViewIfNeeded();
  await expect(area).toHaveAttribute("aria-busy", "false");
  await expect
    .poll(() =>
      area
        .locator("img")
        .evaluate(
          (img: HTMLImageElement) =>
            img.complete &&
            img.naturalWidth > 0 &&
            img.getBoundingClientRect().width > 0,
        ),
    )
    .toBe(true);
}

async function geometry(frame: Locator) {
  return frame.evaluate((element) => {
    const image = element.querySelector("img")!;
    const box = element.getBoundingClientRect(),
      photo = image.getBoundingClientRect();
    return {
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      image: {
        x: photo.x,
        y: photo.y,
        width: photo.width,
        height: photo.height,
      },
      focal: {
        x: ((box.x + box.width / 2 - photo.x) / photo.width) * 100,
        y: ((box.y + box.height / 2 - photo.y) / photo.height) * 100,
      },
    };
  });
}

async function noEdges(frame: Locator) {
  await expect
    .poll(async () => {
      const { box, image } = await geometry(frame);
      return (
        image.x <= box.x + 1 &&
        image.y <= box.y + 1 &&
        image.x + image.width >= box.x + box.width - 1 &&
        image.y + image.height >= box.y + box.height - 1
      );
    })
    .toBe(true);
}

async function panMouse(page: Page, area: Locator, dx: number, dy: number) {
  await area.scrollIntoViewIfNeeded();
  const b = (await area.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(area).not.toHaveClass(/is-dragging/);
}

async function assertImage(frame: Locator, cover: Cover) {
  await frame.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      frame
        .locator("img")
        .evaluate(
          (image: HTMLImageElement) =>
            image.complete && image.naturalWidth > 0 && image.style.left !== "",
        ),
    )
    .toBe(true);
  await expect(frame.locator("img")).toHaveAttribute("src", cover.data!);
  await noEdges(frame);
  const crop = await geometry(frame);
  expect(crop.focal.x).toBeCloseTo(cover.x, 1);
  expect(crop.focal.y).toBeCloseTo(cover.y, 1);
}

test("mouse, wheel and keyboard crop without exposing edges or changing a cancelled goal", async ({
  page,
}) => {
  await start(page);
  const before = await entities(page),
    dialog = await openEditor(page),
    area = areaOf(dialog);
  await expect(zoomOutput(dialog)).toHaveText("100%");
  await dialog
    .getByRole("button", { name: "Ampliar foto", exact: true })
    .click();
  await expect(zoomOutput(dialog)).toHaveText("120%");
  await dialog
    .getByRole("button", { name: "Reduzir foto", exact: true })
    .click();
  await expect(zoomOutput(dialog)).toHaveText("100%");
  await area.dblclick();
  await expect(zoomOutput(dialog)).toHaveText("200%");
  const old = await geometry(area);
  await panMouse(page, area, 35, 22);
  const moved = await geometry(area);
  expect(moved.image.x - old.image.x).toBeCloseTo(35, 0);
  expect(moved.image.y - old.image.y).toBeCloseTo(22, 0);
  await area.focus();
  await page.keyboard.press("ArrowLeft");
  expect((await geometry(area)).image.x - moved.image.x).toBeCloseTo(-12, 0);
  await page.keyboard.press("Shift+ArrowUp");
  expect((await geometry(area)).image.y - moved.image.y).toBeCloseTo(-35, 0);
  await page.keyboard.press("Shift+Equal");
  await expect(zoomOutput(dialog)).toHaveText("240%");
  await page.keyboard.press("Minus");
  await expect(zoomOutput(dialog)).toHaveText("200%");
  const anchorFrame = await geometry(area),
    anchor = {
      x: anchorFrame.box.x + anchorFrame.box.width * 0.37,
      y: anchorFrame.box.y + anchorFrame.box.height * 0.43,
    };
  const beforeAnchor = {
    x: (anchor.x - anchorFrame.image.x) / anchorFrame.image.width,
    y: (anchor.y - anchorFrame.image.y) / anchorFrame.image.height,
  };
  const beforeScroll = await dialog
    .locator(".data-form-content")
    .evaluate((el) => el.scrollTop);
  const pageScroll = await page.evaluate(() => scrollY);
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.wheel(0, -160);
  await expect
    .poll(async () =>
      Number((await zoomOutput(dialog).textContent())!.replace("%", "")),
    )
    .toBeGreaterThan(200);
  const wheelFrame = await geometry(area);
  expect((anchor.x - wheelFrame.image.x) / wheelFrame.image.width).toBeCloseTo(
    beforeAnchor.x,
    3,
  );
  expect((anchor.y - wheelFrame.image.y) / wheelFrame.image.height).toBeCloseTo(
    beforeAnchor.y,
    3,
  );
  expect(
    await dialog.locator(".data-form-content").evaluate((el) => el.scrollTop),
  ).toBe(beforeScroll);
  expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
  await panMouse(page, area, 1200, -1200);
  await noEdges(area);
  await area.focus();
  await page.keyboard.press("0");
  await expect(zoomOutput(dialog)).toHaveText("100%");
  await area.dblclick();
  await expect(zoomOutput(dialog)).toHaveText("200%");
  await area.dblclick();
  await expect(zoomOutput(dialog)).toHaveText("100%");
  await noEdges(area);
  for (let step = 0; step < 8; step++) {
    const enlarge = dialog.getByRole("button", {
      name: "Ampliar foto",
      exact: true,
    });
    if (await enlarge.isEnabled()) await enlarge.click();
  }
  await expect(zoomOutput(dialog)).toHaveText("400%");
  await expect(
    dialog.getByRole("button", { name: "Ampliar foto", exact: true }),
  ).toBeDisabled();
  await noEdges(area);
  await dialog
    .getByRole("button", { name: "Redefinir enquadramento", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Reduzir foto", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(await entities(page)).toEqual(before);
});

type Finger = { x: number; y: number; id: number };
async function touch(
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
  points: Finger[],
) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((p) => ({
      ...p,
      radiusX: 4,
      radiusY: 4,
      force: 1,
    })),
  });
}

test("trusted touch pinch, pan, double tap and cancellation leave the editor usable", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  const dialog = await openEditor(page),
    area = areaOf(dialog),
    cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5,
  });
  try {
    await area.scrollIntoViewIfNeeded();
    const b = (await area.boundingBox())!,
      center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await touch(cdp, "touchStart", [
      { id: 1, x: center.x - 32, y: center.y },
      { id: 2, x: center.x + 32, y: center.y },
    ]);
    for (let d = 40; d <= 64; d += 8)
      await touch(cdp, "touchMove", [
        { id: 1, x: center.x - d, y: center.y },
        { id: 2, x: center.x + d, y: center.y },
      ]);
    await touch(cdp, "touchEnd", []);
    await expect(zoomOutput(dialog)).toHaveText("200%");
    await expect(area).not.toHaveClass(/is-dragging/);
    const before = await geometry(area);
    await touch(cdp, "touchStart", [{ id: 3, ...center }]);
    await touch(cdp, "touchMove", [
      { id: 3, x: center.x + 24, y: center.y + 16 },
    ]);
    await touch(cdp, "touchMove", [
      { id: 3, x: center.x + 44, y: center.y + 26 },
    ]);
    await touch(cdp, "touchEnd", []);
    const moved = await geometry(area);
    expect(moved.image.x - before.image.x).toBeCloseTo(44, 0);
    expect(moved.image.y - before.image.y).toBeCloseTo(26, 0);
    await noEdges(area);
    await touch(cdp, "touchStart", [{ id: 4, ...center }]);
    await touch(cdp, "touchMove", [
      { id: 4, x: center.x + 18, y: center.y - 12 },
    ]);
    await touch(cdp, "touchCancel", []);
    await expect(area).not.toHaveClass(/is-dragging/);
    const cancelled = await geometry(area);
    await touch(cdp, "touchStart", [{ id: 5, ...center }]);
    await touch(cdp, "touchMove", [
      { id: 5, x: center.x - 12, y: center.y + 10 },
    ]);
    await touch(cdp, "touchEnd", []);
    expect((await geometry(area)).image.x - cancelled.image.x).toBeCloseTo(
      -12,
      0,
    );
    await dialog
      .getByRole("button", { name: "Redefinir enquadramento", exact: true })
      .click();
    await expect(zoomOutput(dialog)).toHaveText("100%");
    await area.scrollIntoViewIfNeeded();
    for (let tap = 0; tap < 2; tap++) {
      await touch(cdp, "touchStart", [{ id: 6 + tap, ...center }]);
      await touch(cdp, "touchEnd", []);
    }
    await expect(zoomOutput(dialog)).toHaveText("200%");
    await noEdges(area);
    await dialog
      .getByRole("button", { name: "Salvar meta", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    const saved = (await entities(page)).find(
      (e) => e.data.name === "Próxima viagem",
    )!.data.cover;
    expect(saved).toMatchObject({ framing: "focal", zoom: 2 });
    await page
      .getByRole("button", { name: "Editar horizonte", exact: true })
      .click();
    const reopened = page.getByRole("dialog", {
      name: "Editar horizonte",
      exact: true,
    });
    await reopened
      .getByRole("button", { name: "Foto de capa", exact: true })
      .click();
    await ready(areaOf(reopened));
    await expect(zoomOutput(reopened)).toHaveText("200%");
    await noEdges(areaOf(reopened));
  } finally {
    await cdp.detach();
  }
});

test("uploaded focal framing persists encrypted through reload and matches dashboard, list and details", async ({
  page,
}) => {
  await start(page, true);
  await page
    .getByRole("button", { name: "Criar horizonte", exact: true })
    .first()
    .click();
  const name = "Minha capa persistida QA",
    dialog = await beginDirectHorizon(page, "Viagem");
  await dialog.getByLabel("Nome do objetivo", { exact: true }).fill(name);
  await dialog.getByLabel("Valor desejado (R$)", { exact: true }).fill("9000");
  await dialog
    .getByText("Personalizar foto e destaque", { exact: true })
    .click();
  await dialog
    .getByLabel("Enviar foto da capa", { exact: true })
    .setInputFiles("public/covers/travel-mountains.webp");
  const area = areaOf(dialog);
  await ready(area);
  await expect(area.locator("img")).toHaveAttribute(
    "src",
    /^data:image\/webp;base64,/,
  );
  await area.dblclick();
  await expect(zoomOutput(dialog)).toHaveText("200%");
  await panMouse(page, area, 22, -14);
  await noEdges(area);
  await finishDirectHorizon(page);
  const created = (await entities(page)).find((e) => e.data.name === name)!,
    saved: Cover = created.data.cover;
  expect(saved).toMatchObject({ type: "upload", framing: "focal", zoom: 2 });
  expect(saved.x).not.toBe(50);
  expect(saved.data!.length).toBeLessThan(300000);
  await assertImage(card(page, name).locator(".horizon-cover"), saved);
  await navigateApp(page, "Visão geral");
  await assertImage(
    page
      .locator(".next-horizons")
      .getByRole("img", { name: `Capa de ${name}`, exact: true })
      .locator(".."),
    saved,
  );
  await page.reload();
  await page.getByRole("button", { name: /Desbloquear cofre/ }).click();
  await page.getByLabel("Senha-mestra", { exact: false }).fill(password);
  await page
    .getByRole("button", { name: "Desbloquear cofre", exact: true })
    .click();
  await expect(page.locator("main.page-overview")).toBeVisible();
  expect(
    (await entities(page)).find((e) => e.id === created.id)!.data.cover,
  ).toEqual(saved);
  await assertImage(
    page
      .locator(".next-horizons")
      .getByRole("img", { name: `Capa de ${name}`, exact: true })
      .locator(".."),
    saved,
  );
  await navigateApp(page, "Meus horizontes");
  await assertImage(card(page, name).locator(".horizon-cover"), saved);
  await card(page, name)
    .getByRole("button", { name: "Ver horizonte", exact: true })
    .click();
  await assertImage(
    page.locator(".horizon-detail-cover .horizon-cover"),
    saved,
  );
  await page
    .getByRole("button", { name: "Editar horizonte", exact: true })
    .click();
  const edit = page.getByRole("dialog", {
    name: "Editar horizonte",
    exact: true,
  });
  await edit.getByRole("button", { name: "Foto de capa", exact: true }).click();
  await ready(areaOf(edit));
  await expect(zoomOutput(edit)).toHaveText("200%");
  await assertImage(areaOf(edit), saved);
  await edit
    .getByRole("button", { name: "Escolher capa Viagens 2", exact: true })
    .click();
  await expect(areaOf(edit).locator("img")).toHaveAttribute(
    "src",
    "/covers/travel-mountains.webp",
  );
  await edit.getByRole("button", { name: /Sua foto enviada/ }).click();
  await ready(areaOf(edit));
  await assertImage(areaOf(edit), saved);
  await edit.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(
    (await entities(page)).find((e) => e.id === created.id)!.data.cover,
  ).toEqual(saved);
  const envelope = await page.evaluate(async () => {
    const request = indexedDB.open("financeiro5-encrypted");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<string>((resolve, reject) => {
        const query = db.transaction("vaults").objectStore("vaults").getAll();
        query.onsuccess = () => resolve(JSON.stringify(query.result));
        query.onerror = () => reject(query.error);
      });
    } finally {
      db.close();
    }
  });
  expect(envelope).not.toContain(name);
  expect(envelope).not.toContain(saved.data!);
  expect(envelope).not.toContain("data:image/webp");
});

test("photo modal keeps header and actions visible while only its content scrolls at 360, 768 and 1440 pixels", async ({
  page,
}) => {
  await start(page);
  const dialog = await openEditor(page);
  for (const [width, height] of [
    [360, 800],
    [768, 1024],
    [1440, 1000],
  ]) {
    await test.step(`${width}px`, async () => {
      await page.setViewportSize({ width, height });
      const content = dialog.locator(".data-form-content");
      await content.evaluate((el) => {
        el.scrollTop = 0;
      });
      await ready(areaOf(dialog));
      for (const locator of [
        dialog.locator(".modal-head"),
        dialog.getByRole("button", { name: "Salvar meta", exact: true }),
        dialog.getByRole("button", { name: "Cancelar", exact: true }),
      ]) {
        await expect(locator).toBeInViewport();
        const box = (await locator.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
      }
      const area = (await areaOf(dialog).boundingBox())!;
      expect(area.width).toBeGreaterThanOrEqual(width === 360 ? 300 : 640);
      const initialHeader = (await dialog
          .locator(".modal-head")
          .boundingBox())!,
        initialSave = (await dialog
          .getByRole("button", { name: "Salvar meta", exact: true })
          .boundingBox())!;
      expect(
        await content.evaluate((el) => el.scrollHeight > el.clientHeight),
      ).toBe(true);
      await content.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      expect((await dialog.locator(".modal-head").boundingBox())!.y).toBe(
        initialHeader.y,
      );
      expect(
        (await dialog
          .getByRole("button", { name: "Salvar meta", exact: true })
          .boundingBox())!.y,
      ).toBe(initialSave.y);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await content.evaluate((el) => {
        el.scrollTop = 0;
      });
      await page.screenshot({
        path: test.info().outputPath(`cover-${width}.png`),
        fullPage: false,
        animations: "disabled",
      });
    });
  }
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
});
