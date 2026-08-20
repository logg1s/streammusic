import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Keep QR codes and bookmarks from the first TV release working. */
export default async function LegacyTvPairingPage({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    paired?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();
  if (params.code) next.set("code", params.code);
  if (params.paired) next.set("paired", params.paired);
  if (params.error) next.set("error", params.error);
  redirect(`/pair${next.size > 0 ? `?${next}` : ""}`);
}
