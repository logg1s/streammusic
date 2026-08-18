/** Thông tin tối thiểu hai vỏ native cần từ GitHub Release mới nhất. */
export interface LatestRelease {
  version: string;
  pageUrl: string;
  androidUrl: string | null;
  windowsUrl: string | null;
}

function versionParts(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  return match ? match.slice(1).map(Number) : null;
}

/** Chỉ stable semver ba phần; chuỗi hỏng không bao giờ ép người dùng cập nhật. */
export function isNewerVersion(latest: string, current: string): boolean {
  const next = versionParts(latest);
  const installed = versionParts(current);
  if (!next || !installed) return false;
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== installed[index]) return next[index] > installed[index];
  }
  return false;
}

/** Không mở URL tuỳ ý nếu endpoint hoặc proxy bị sửa ngoài ý muốn. */
export function isVongReleaseUrl(value: string): boolean {
  return /^https:\/\/github\.com\/logg1s\/streammusic\/releases\/(?:tag|download)\/[^\s]+$/.test(
    value,
  );
}
