import type { LatestRelease } from "@vong/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPOSITORY = "logg1s/streammusic";

interface GithubRelease {
  tag_name?: unknown;
  html_url?: unknown;
  assets?: unknown;
}

interface GithubAsset {
  name?: unknown;
  browser_download_url?: unknown;
}

function fixtureRelease(version: string): LatestRelease {
  const tag = `v${version}`;
  const base = `https://github.com/${REPOSITORY}/releases/download/${tag}`;
  return {
    version,
    pageUrl: `https://github.com/${REPOSITORY}/releases/tag/${tag}`,
    androidUrl: `${base}/Vong_${version}_arm64.apk`,
    windowsUrl: `${base}/Vong_${version}_x64-setup.exe`,
  };
}

export async function GET() {
  const e2eVersion = process.env.VONG_E2E_LATEST_VERSION;
  if (process.env.NODE_ENV !== "production" && e2eVersion) {
    return Response.json(fixtureRelease(e2eVersion));
  }

  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/releases/latest`,
    {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "Vong-update-checker",
      },
      next: { revalidate: 900 },
    },
  );
  if (!response.ok) {
    return Response.json({ error: "Không lấy được bản phát hành mới nhất" }, { status: 502 });
  }

  const release = (await response.json()) as GithubRelease;
  const tag = typeof release.tag_name === "string" ? release.tag_name : "";
  const version = tag.replace(/^v/, "");
  const pageUrl = typeof release.html_url === "string" ? release.html_url : "";
  const assets = Array.isArray(release.assets)
    ? (release.assets as GithubAsset[])
    : [];
  const assetUrl = (pattern: RegExp) => {
    const asset = assets.find(
      (item) => typeof item.name === "string" && pattern.test(item.name),
    );
    return typeof asset?.browser_download_url === "string"
      ? asset.browser_download_url
      : null;
  };

  if (!version || !pageUrl) {
    return Response.json({ error: "GitHub Release không hợp lệ" }, { status: 502 });
  }
  const result: LatestRelease = {
    version,
    pageUrl,
    androidUrl: assetUrl(/arm64.*\.apk$/i),
    windowsUrl: assetUrl(/_x64-setup\.exe$/i),
  };
  return Response.json(result);
}
