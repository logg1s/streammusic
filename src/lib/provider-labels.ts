import type { StorageProviderId } from "@/db/schema";

/** Nhãn hiển thị — tách riêng để component client không phải nạp cả module provider (chỉ chạy được ở server). */
export const PROVIDER_LABEL: Record<StorageProviderId, string> = {
  google_drive: "Google Drive",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
};
