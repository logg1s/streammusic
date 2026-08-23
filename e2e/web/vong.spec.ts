import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";
import type { PlayableTrack } from "@vong/shared";

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

function youtubeTrack(title: string, videoId: string): PlayableTrack {
  return {
    id: `yt:${videoId}`,
    source: "youtube",
    youtubeVideoId: videoId,
    title,
    artistId: null,
    artistName: "Nghệ sĩ E2E",
    albumId: null,
    albumName: "Album E2E",
    coverUrl: null,
    durationSec: 210,
    trackNo: null,
    discNo: null,
    provider: null,
    codec: null,
    bitrate: null,
  };
}

test("đăng nhập và duyệt thư viện", async ({ browser, page }) => {
  await page.goto("/tracks");
  await expect(page.getByRole("button", { name: "Đăng nhập bằng Google" })).toBeVisible();

  const auth = await loggedInPage(browser);
  const data = await fixture();
  await auth.goto("/tracks");
  await expect(auth.getByRole("heading", { name: "Bài hát" })).toBeVisible();
  await expect(auth.getByText(data.titles[0], { exact: true })).toBeVisible();
  await expect(auth.getByRole("button", { name: /Mở Đang phát:/ })).toHaveCount(0);
  await auth.close();
});

test("ghép nối web bằng mã được xác nhận trên điện thoại", async ({ browser }) => {
  const targetContext = await browser.newContext();
  const target = await targetContext.newPage();
  await target.goto("/login");
  await expect(target.getByText("Quét để đăng nhập web", { exact: true })).toBeVisible();
  const displayCode = (await target.locator("p.font-mono").innerText()).trim();
  expect(displayCode).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

  const phone = await loggedInPage(browser);
  await phone.goto(`/pair?code=${encodeURIComponent(displayCode)}`);
  await expect(phone.getByText("trình duyệt web", { exact: true })).toBeVisible();
  await phone
    .getByRole("button", { name: "Ghép nối trình duyệt web", exact: true })
    .click();
  await expect(phone).toHaveURL(/\/pair\?paired=web$/);

  await expect(target).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(
    target.getByRole("heading", { name: "Âm nhạc dành cho bạn" }),
  ).toBeVisible();

  await phone.context().close();
  await targetContext.close();
});

test("tìm kiếm, playlist, phát nhạc, chuyển bài và phát nền", async ({ browser }) => {
  const page = await loggedInPage(browser);
  const data = await fixture();
  const artifacts = process.env.VONG_E2E_ARTIFACTS;
  if (!artifacts) throw new Error("Thiếu VONG_E2E_ARTIFACTS");

  await page.goto("/search?q=S%C3%B3ng%20Th%E1%BB%AD%20Nghi%E1%BB%87m");
  await expect(page.getByRole("heading", { name: "Tìm kiếm" })).toBeVisible();
  await expect(page.getByText(data.titles[0], { exact: true })).toBeVisible();

  await page.goto("/playlists");
  await expect(page.getByText(data.playlistName, { exact: true })).toBeVisible();

  await page.goto("/tracks");
  // Trang bài hát xếp theo tiêu đề: "Ba" đứng trước "Hai", nên đây là cặp kế nhau.
  await page
    .getByRole("button", { name: `Phát ${data.titles[2]}`, exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Tạm dừng" })).toBeVisible();
  await expect(page.getByText(data.titles[2], { exact: true }).last()).toBeVisible();
  await page
    .getByRole("button", { name: `Mở Đang phát: ${data.titles[2]}`, exact: true })
    .click();
  const nowPlaying = page.getByRole("dialog", { name: "Đang phát" });
  await expect(nowPlaying).toBeVisible();
  await expect(nowPlaying.getByRole("heading", { name: data.titles[2], exact: true })).toBeVisible();
  await expect(nowPlaying.getByRole("slider", { name: "Vị trí phát" })).toBeVisible();
  await page.screenshot({ path: `${artifacts}/web-now-playing.png`, fullPage: true });
  await nowPlaying.getByRole("button", { name: "Hàng đợi" }).click();
  const queueFromNowPlaying = page.getByRole("dialog", { name: "Hàng đợi phát" });
  await expect(queueFromNowPlaying).toBeVisible();
  await queueFromNowPlaying.getByRole("button", { name: "Đóng" }).click();
  const playingTime = () =>
    page.locator("audio").evaluateAll((nodes) =>
      Math.max(0, ...nodes.filter((node) => !(node as HTMLAudioElement).paused).map((node) => (node as HTMLAudioElement).currentTime)),
    );
  await expect.poll(playingTime, { timeout: 15_000 }).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Hàng đợi" }).click();
  const queue = page.getByRole("dialog", { name: "Hàng đợi phát" });
  await expect(queue).toBeVisible();
  await expect(queue.getByText(data.titles[2], { exact: true })).toBeVisible();
  await queue.getByRole("button", { name: "Đóng" }).click();
  await expect(queue).toBeHidden();

  await page.getByRole("button", { name: "Bài sau" }).click();
  await expect(page.getByText(data.titles[1], { exact: true }).last()).toBeVisible();
  await expect.poll(playingTime, { timeout: 15_000 }).toBeGreaterThan(0);

  const scrubber = page.getByRole("slider", { name: "Vị trí phát" });
  await scrubber.press("ArrowRight");
  await expect
    .poll(async () => Number(await scrubber.getAttribute("aria-valuenow")))
    .toBeGreaterThanOrEqual(5);
  const box = await scrubber.boundingBox();
  if (!box) throw new Error("Không đọc được kích thước thanh tua");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  await expect
    .poll(async () => Number(await scrubber.getAttribute("aria-valuenow")))
    .toBeGreaterThanOrEqual(25);

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
  await row.hover();
  await row.getByRole("button", { name: "Thêm vào Yêu thích" }).click();
  await expect(
    row.getByRole("button", { name: "Bỏ khỏi Yêu thích" }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Bỏ khỏi Yêu thích" }).click();
  await expect(
    row.getByRole("button", { name: "Thêm vào Yêu thích" }),
  ).toBeVisible();
  // Thêm lại để Android và Windows kế tiếp xác nhận cùng dữ liệu cloud.
  const [addAgainResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/favorites" &&
        response.request().method() === "POST",
    ),
    row.getByRole("button", { name: "Thêm vào Yêu thích" }).click(),
  ]);
  expect(addAgainResponse.ok()).toBeTruthy();

  await page.goto("/favorites");
  await expect(page.getByRole("heading", { name: "Yêu thích" })).toBeVisible();
  await expect(page.getByText(data.titles[0], { exact: true })).toBeVisible();
  await page.context().close();
});

test("Home có release shelf phát được và tìm kiếm", async ({ browser }) => {
  const page = await loggedInPage(browser);
  const artifacts = process.env.VONG_E2E_ARTIFACTS;
  if (!artifacts) throw new Error("Thiếu VONG_E2E_ARTIFACTS");
  const release = youtubeTrack("Bản phát hành E2E", "release-e2e");
  const followUp = youtubeTrack("Bài tiếp theo E2E", "release-next-e2e");

  await page.route("**/api/youtube/home", (route) =>
    route.fulfill({
      json: { sections: [{ title: "Mới phát hành", tracks: [release] }] },
    }),
  );
  await page.route("**/api/youtube/trending", (route) =>
    route.fulfill({ json: { tracks: [] } }),
  );
  await page.route("**/api/radio", (route) =>
    route.fulfill({
      json: {
        tracks: [followUp],
        continuation: null,
        playlistId: "e2e-release-radio",
      },
    }),
  );

  await page.goto("/");
  await expect(page.getByRole("img", { name: "Vọng" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Âm nhạc dành cho bạn" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mới phát hành" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: release.title, exact: true }),
  ).toBeVisible();
  const radioRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/api/radio",
  );
  await page.getByRole("button", { name: `Phát ${release.title}` }).first().click();
  await radioRequest;
  await expect(page.getByText(release.title, { exact: true }).last()).toBeVisible();
  await page.screenshot({ path: `${artifacts}/web-home.png`, fullPage: true });

  await page.goto("/search");
  await expect(page.getByPlaceholder("Bạn muốn nghe gì?")).toBeVisible();
  await page.screenshot({ path: `${artifacts}/web-search.png`, fullPage: true });
  await page.context().close();
});

test("Thư viện là điểm vào các bộ sưu tập", async ({ browser }) => {
  const page = await loggedInPage(browser);
  const artifacts = process.env.VONG_E2E_ARTIFACTS;
  if (!artifacts) throw new Error("Thiếu VONG_E2E_ARTIFACTS");

  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: "Thư viện", exact: true }),
  ).toBeVisible();
  const collections = page.getByRole("navigation", { name: "Bộ sưu tập thư viện" });
  await expect(collections.getByRole("link", { name: "Album" })).toBeVisible();
  await expect(collections.getByRole("link", { name: "Nghệ sĩ" })).toBeVisible();
  await expect(collections.getByRole("link", { name: "Bài hát" })).toBeVisible();
  await expect(collections.getByRole("link", { name: "Yêu thích" })).toBeVisible();
  await expect(collections.getByRole("link", { name: "Playlist" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Album gần đây" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nghệ sĩ trong thư viện" }),
  ).toBeVisible();
  await page.screenshot({ path: `${artifacts}/web-library.png`, fullPage: true });

  await collections.getByRole("link", { name: "Bài hát" }).click();
  await expect(page).toHaveURL(/\/tracks$/);
  await page.context().close();
});

test("Home giữ nhạc thư viện khi discovery không tải được", async ({ browser }) => {
  const page = await loggedInPage(browser);
  const data = await fixture();

  await page.route("**/api/youtube/home", (route) => route.fulfill({ status: 503 }));
  await page.route("**/api/youtube/trending", (route) => route.fulfill({ status: 503 }));
  await page.goto("/");

  await expect(
    page.getByText(
      "Chưa thể tải gợi ý lúc này. Thư viện và nhạc gần đây của bạn vẫn sẵn sàng.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vừa thêm vào" })).toBeVisible();
  await expect(page.getByText(data.titles[2], { exact: true }).last()).toBeVisible();
  await page.context().close();
});

test("Search là điểm khám phá trước khi nhập từ khoá", async ({ browser }) => {
  const page = await loggedInPage(browser);
  const release = youtubeTrack("Bản phát hành Search E2E", "search-release-e2e");
  const trending = youtubeTrack("Xu hướng Search E2E", "search-trending-e2e");

  await page.route("**/api/youtube/home", (route) =>
    route.fulfill({
      json: { sections: [{ title: "Mới phát hành", tracks: [release] }] },
    }),
  );
  await page.route("**/api/youtube/trending", (route) =>
    route.fulfill({ json: { tracks: [trending] } }),
  );
  await page.route("**/api/radio", (route) =>
    route.fulfill({
      json: { tracks: [release], continuation: null, playlistId: "search-e2e-radio" },
    }),
  );

  await page.goto("/search");
  await expect(page.getByRole("heading", { name: "Có thể bạn sẽ thích" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mới phát hành" })).toBeVisible();
  const radioRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/api/radio",
  );
  await page.getByRole("button", { name: `Phát ${release.title}` }).click();
  await radioRequest;
  await expect(page.getByText(release.title, { exact: true }).last()).toBeVisible();
  await page.context().close();

  const fallback = await loggedInPage(browser);
  await fallback.route("**/api/youtube/home", (route) => route.fulfill({ status: 503 }));
  await fallback.route("**/api/youtube/trending", (route) => route.fulfill({ status: 503 }));
  await fallback.route("**/api/youtube/search", (route) => route.fulfill({ json: { tracks: [] } }));
  await fallback.goto("/search?landing=failure");
  await expect(
    fallback.getByText(
      "Chưa thể tải nhạc để khám phá lúc này. Bạn vẫn có thể tìm trong thư viện hoặc trên YouTube.",
      { exact: true },
    ),
  ).toBeVisible();
  await fallback.getByPlaceholder("Bạn muốn nghe gì?").fill("Sóng E2E");
  await fallback.getByRole("search").press("Enter");
  await expect(fallback).toHaveURL(/\/search\?q=S%C3%B3ng%20E2E/);
  await fallback.context().close();
});

test("menu bài hát mở bằng ba chấm và chuột phải", async ({ browser }) => {
  const page = await loggedInPage(browser);
  const data = await fixture();
  await page.goto("/tracks");

  const row = page.getByRole("listitem").filter({ hasText: data.titles[0] });
  await row.hover();
  await row
    .getByRole("button", { name: `Tùy chọn cho ${data.titles[0]}` })
    .click();
  const menu = page.getByRole("menu", {
    name: `Tùy chọn cho ${data.titles[0]}`,
  });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Phát tiếp" })).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Thêm vào hàng đợi" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  await row.click({ button: "right" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Thêm vào playlist" }).click();
  await expect(
    page.getByRole("dialog", { name: "Thêm vào playlist" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Đóng" }).click();
  await page.context().close();
});
