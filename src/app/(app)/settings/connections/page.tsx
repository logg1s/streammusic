import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { scanRoots, tracks } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { ConnectionsManager } from "@/components/settings/connections-manager";
import { requireUserId } from "@/lib/auth";
import { listConnections } from "@/lib/connections";
import { ALL_PROVIDERS } from "@/lib/providers";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const userId = await requireUserId();
  const { error, connected } = await searchParams;

  const connections = await listConnections(userId);
  const db = getDb();

  const views = await Promise.all(
    connections.map(async (connection) => {
      const [roots, [trackCount]] = await Promise.all([
        db.select().from(scanRoots).where(eq(scanRoots.connectionId, connection.id)),
        db
          .select({ value: count() })
          .from(tracks)
          .where(eq(tracks.connectionId, connection.id)),
      ]);

      return {
        id: connection.id,
        provider: connection.provider,
        label: connection.label,
        status: connection.status,
        trackCount: trackCount?.value ?? 0,
        roots: roots.map((r) => ({
          id: r.id,
          remoteId: r.remoteId,
          name: r.name,
          path: r.path,
        })),
      };
    }),
  );

  // Provider chưa điền client id/secret thì không hiện ra để khỏi dẫn vào ngõ cụt.
  const available = ALL_PROVIDERS.filter((p) => p.isConfigured()).map((p) => ({
    id: p.id,
    displayName: p.displayName,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Cài đặt"
        title="Kho lưu trữ"
        readout={`${views.length} kết nối  ·  ${views.reduce((s, v) => s + v.trackCount, 0)} bài đã lập chỉ mục`}
      />

      {error && (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {connected && (
        <p
          role="status"
          className="mb-6 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent-text"
        >
          Đã nối {connected}. Chọn thư mục nhạc rồi bấm quét.
        </p>
      )}

      <ConnectionsManager connections={views} available={available} />
    </>
  );
}
