import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";

interface Fixture {
  cookie: { name: string; value: string };
  titles: string[];
  playlistName: string;
}

async function fixture(): Promise<Fixture> {
  const path = process.env.VONG_E2E_STATE_FILE;
  if (!path) throw new Error("Thiếu VONG_E2E_STATE_FILE");
  return JSON.parse(await readFile(path, "utf8")) as Fixture;
}

async function loggedInPage(browser: Browser): Promise<Page> {
  const data = await fixture();
  const origin = process.env.VONG_E2E_WEB_ORIGIN ?? "http://127.0.0.1:3000";
  const context = await browser.newContext();
  await context.addCookies([{ ...data.cookie, url: origin }]);
  return context.newPage();
}

test("đăng nhập và duyệt thư viện", async ({ browser, page }) => {
  await page.goto("/tracks");
  await expect(page.getByRole("button", { name: "Đăng nhập bằng Google" })).toBeVisible();

  const auth = await loggedInPage(browser);
  const data = await fixture();
  await auth.goto("/tracks");
  await expect(auth.getByRole("heading", { name: "Bài hát" })).toBeVisible();
  await expect(auth.getByText(data.titles[0], { exact: true })).toBeVisible();
  await auth.close();
});

test("tìm kiếm, playlist, phát nhạc, chuyển bài và phát nền", async ({ browser }) => {
  const page = await loggedInPage(browser);
  const data = await fixture();

  await page.goto("/search?q=S%C3%B3ng%20Th%E1%BB%AD%20Nghi%E1%BB%87m");
  await expect(page.getByRole("heading", { name: "Tìm kiếm" })).toBeVisible();
  await expect(page.getByText(data.titles[0], { exact: true })).toBeVisible();

  await page.goto("/playlists");
  await expect(page.getByText(data.playlistName, { exact: true })).toBeVisible();

  await page.goto("/tracks");
  // Trang bài hát xếp theo tiêu đề: "Ba" đứng trước "Hai", nên đây là cặp kế nhau.
  await page.getByText(data.titles[2], { exact: true }).click();
  await expect(page.getByRole("button", { name: "Tạm dừng" })).toBeVisible();
  await expect(page.getByText(data.titles[2], { exact: true }).last()).toBeVisible();
  const playingTime = () =>
    page.locator("audio").evaluateAll((nodes) =>
      Math.max(0, ...nodes.filter((node) => !(node as HTMLAudioElement).paused).map((node) => (node as HTMLAudioElement).currentTime)),
    );
  await expect.poll(playingTime, { timeout: 15_000 }).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Bài sau" }).click();
  await expect(page.getByText(data.titles[1], { exact: true }).last()).toBeVisible();
  await expect.poll(playingTime, { timeout: 15_000 }).toBeGreaterThan(0);
  const before = await playingTime();
  const background = await page.context().newPage();
  await background.goto("about:blank");
  await background.bringToFront();
  await page.waitForTimeout(2_000);
  await page.bringToFront();
  await expect.poll(playingTime, { timeout: 10_000 }).toBeGreaterThan(before);
  await page.context().close();
});

test("thêm và mở danh sách Yêu thích", async ({ browser }) => {
  const page = await loggedInPage(browser);
  const data = await fixture();
  await page.goto("/tracks");

  const row = page.getByRole("listitem").filter({ hasText: data.titles[0] });
  await row.getByRole("button", { name: "Thêm vào Yêu thích" }).click();
  await expect(
    row.getByRole("button", { name: "Bỏ khỏi Yêu thích" }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Bỏ khỏi Yêu thích" }).click();
  await expect(
    row.getByRole("button", { name: "Thêm vào Yêu thích" }),
  ).toBeVisible();
  // Thêm lại để Android và Windows kế tiếp xác nhận cùng dữ liệu cloud.
  await row.getByRole("button", { name: "Thêm vào Yêu thích" }).click();

  await page.goto("/favorites");
  await expect(page.getByRole("heading", { name: "Yêu thích" })).toBeVisible();
  await expect(page.getByText(data.titles[0], { exact: true })).toBeVisible();
  await page.context().close();
});
