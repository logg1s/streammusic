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
    androidTvUrl: `${base}/Vong_${version}_android-tv_universal.apk`,
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
    return Response.json(
      { error: "Không lấy được bản phát hành mới nhất" },
      { status: 502 },
    );
  }

  const release = (await response.json()) as GithubRelease;
  const tag = typeof release.tag_name === "string" ? release.tag_name : "";
  const versionMatch = /^v(\d+\.\d+\.\d+)$/.exec(tag);
  const version = versionMatch?.[1] ?? "";
  const pageUrl = typeof release.html_url === "string" ? release.html_url : "";
  const assets = Array.isArray(release.assets)
    ? (release.assets as GithubAsset[])
    : [];
  const assetUrl = (pattern: RegExp) => {
    const asset = assets.find(
      (item) => typeof item.name === "string" && pattern.test(item.name),
    );
    if (
      typeof asset?.name !== "string" ||
      typeof asset.browser_download_url !== "string"
    ) {
      return null;
    }
    try {
      const url = new URL(asset.browser_download_url);
      const expectedPath = `/${REPOSITORY}/releases/download/${tag}/${asset.name}`;
      return url.origin === "https://github.com" && url.pathname === expectedPath
        ? url.href
        : null;
    } catch {
      return null;
    }
  };

  const expectedPageUrl = `https://github.com/${REPOSITORY}/releases/tag/${tag}`;
  if (!version || pageUrl !== expectedPageUrl) {
    return Response.json(
      { error: "GitHub Release không hợp lệ" },
      { status: 502 },
    );
  }
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const result: LatestRelease = {
    version,
    pageUrl,
    androidUrl: assetUrl(new RegExp(`^Vong_${escapedVersion}_arm64\\.apk$`, "i")),
    androidTvUrl: assetUrl(
      new RegExp(`^Vong_${escapedVersion}_android-tv_universal\\.apk$`, "i"),
    ),
    windowsUrl: assetUrl(
      new RegExp(`^Vong_${escapedVersion}_x64-setup\\.exe$`, "i"),
    ),
  };
  return Response.json(result);
}
