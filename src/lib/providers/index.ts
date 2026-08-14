import type { StorageProviderId } from "@/db/schema";
import { dropboxProvider } from "./dropbox";
import { googleDriveProvider } from "./google-drive";
import { oneDriveProvider } from "./onedrive";
import type { StorageProvider } from "./types";

const REGISTRY: Record<StorageProviderId, StorageProvider> = {
  dropbox: dropboxProvider,
  google_drive: googleDriveProvider,
  onedrive: oneDriveProvider,
};

export function getProvider(id: StorageProviderId): StorageProvider {
  const provider = REGISTRY[id];
  if (!provider) throw new Error(`Provider không tồn tại: ${id}`);
  return provider;
}

export function isProviderId(value: string): value is StorageProviderId {
  return value in REGISTRY;
}

/** Thứ tự hiển thị trên UI: dễ cấu hình nhất lên trước. */
export const ALL_PROVIDERS: StorageProvider[] = [
  dropboxProvider,
  oneDriveProvider,
  googleDriveProvider,
];

export * from "./types";
