import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { chromium, expect } from "@playwright/test";

interface Fixture {
  cookie: { name: string; value: string };
  titles: string[];
  playlistName: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu ${name}`);
  return value;
}

const statePath = requiredEnv("VONG_E2E_STATE_FILE");
const cdp = process.env.VONG_E2E_CDP ?? "http://127.0.0.1:9223";
const origin = process.env.VONG_E2E_WEB_ORIGIN ?? "http://127.0.0.1:3000";

function windowState(command: "minimize" | "restore") {
  const show = command === "minimize" ? 6 : 9;
  const script = [
    "Add-Type -Namespace Native -Name Win -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);'",
    `$p = Get-Process vong -ErrorAction Stop | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1`,
    `if (-not $p) { throw 'Không tìm thấy cửa sổ Vọng' }`,
    `[Native.Win]::ShowWindowAsync($p.MainWindowHandle, ${show}) | Out-Null`,
  ].join("; ");
  execFileSync("powershell.exe", ["-NoProfile", "-Command", script]);
}

async function main() {
  const fixture = JSON.parse(await readFile(statePath, "utf8")) as Fixture;
  const browser = await chromium.connectOverCDP(cdp);
  try {
    const context = browser.contexts()[0];
    const pages = context.pages();
    const page = pages[0];
    // Tauri reuses its WebView2 profile between runs. Isolate the E2E session from
    // a developer's persisted auth/player queue before installing the fixture.
    await context.clearCookies();
    await page.goto(origin);
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await context.addCookies([{ ...fixture.cookie, url: origin }]);
    await page.goto(`${origin}/tracks`);
    await expect(page.getByText(fixture.titles[0], { exact: true })).toBeVisible();

    await page.goto(`${origin}/search?q=S%C3%B3ng%20Th%E1%BB%AD%20Nghi%E1%BB%87m`);
    await expect(page.getByText(fixture.titles[0], { exact: true })).toBeVisible();
    await page.goto(`${origin}/playlists`);
    await expect(page.getByText(fixture.playlistName, { exact: true })).toBeVisible();

    await page.goto(`${origin}/tracks`);
    const row = page
      .getByRole("listitem")
      .filter({ hasText: fixture.titles[2] });
    const rowPlay = row.getByRole("button").first();
    await expect
      .poll(
        async () => {
          if ((await rowPlay.getAttribute("aria-current")) !== "true") {
            await rowPlay.click();
          }
          return rowPlay.getAttribute("aria-current");
        },
        { timeout: 15_000 },
      )
      .toBe("true");
    await expect(page.getByRole("button", { name: "Tạm dừng" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Bài sau" }).click();
    await expect(page.getByText(fixture.titles[1], { exact: true }).last()).toBeVisible();

    const scrubber = page.getByLabel("Vị trí phát");
    await expect.poll(async () => Number(await scrubber.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
    const before = Number(await scrubber.getAttribute("aria-valuenow"));
    windowState("minimize");
    await page.waitForTimeout(2_500);
    windowState("restore");
    await expect.poll(async () => Number(await scrubber.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
  } finally {
    await browser.close();
  }
}

void main();
