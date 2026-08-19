import { beforeEach, describe, expect, it, vi } from "vitest";

interface StoredRow {
  identifier: string;
  token: string;
  expires: Date;
}

type Column = keyof StoredRow;
type Predicate = (row: StoredRow) => boolean;

const harness = vi.hoisted(() => ({
  rows: [] as StoredRow[],
  minted: 0,
}));

vi.mock("drizzle-orm", () => {
  const pattern = (value: string) =>
    new RegExp(
      `^${value
        .split("%")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*")}$`,
    );
  return {
    and:
      (...predicates: Predicate[]): Predicate =>
      (row) =>
        predicates.every((predicate) => predicate(row)),
    eq:
      (column: Column, value: unknown): Predicate =>
      (row) =>
        row[column] === value,
    like:
      (column: Column, value: string): Predicate =>
      (row) =>
        pattern(value).test(String(row[column])),
    lt:
      (column: Column, value: Date): Predicate =>
      (row) =>
        row[column] instanceof Date && row[column].getTime() < value.getTime(),
    or:
      (...predicates: Predicate[]): Predicate =>
      (row) =>
        predicates.some((predicate) => predicate(row)),
  };
});

vi.mock("@/db/schema", () => ({
  verificationTokens: {
    identifier: "identifier",
    token: "token",
    expires: "expires",
  },
}));

vi.mock("@/lib/native-handoff", () => ({
  mintForUser: vi.fn(async (_headers: Headers, userId: string) => {
    harness.minted += 1;
    return { token: `session-for-${userId}`, expiresAt: Date.now() + 60_000 };
  }),
}));

function project(
  row: StoredRow,
  selection: Record<string, Column>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(selection).map(([key, column]) => [key, row[column]]),
  );
}

vi.mock("@/db", () => ({
  getDb: () => ({
    delete: () => ({
      where: (predicate: Predicate) => {
        const remove = () => {
          const removed = harness.rows.filter(predicate);
          harness.rows = harness.rows.filter((row) => !predicate(row));
          return removed;
        };
        return {
          then: (resolve: (value?: unknown) => void) =>
            Promise.resolve(remove()).then(() => resolve()),
          returning: async (selection: Record<string, Column>) =>
            remove().map((row) => project(row, selection)),
        };
      },
    }),
    select: (selection: Record<string, Column>) => ({
      from: () => ({
        where: (predicate: Predicate) => ({
          limit: async (limit: number) =>
            harness.rows
              .filter(predicate)
              .slice(0, limit)
              .map((row) => project(row, selection)),
        }),
      }),
    }),
    insert: () => ({
      values: (row: StoredRow) => {
        const insert = () => {
          harness.rows.push(row);
          return row;
        };
        const conflicts = () =>
          harness.rows.some(
            (candidate) =>
              candidate.identifier === row.identifier &&
              candidate.token === row.token,
          );
        return {
          then: (resolve: (value?: unknown) => void) =>
            Promise.resolve(insert()).then(() => resolve()),
          onConflictDoNothing: () => ({
            returning: async (selection: Record<string, Column>) => {
              if (conflicts()) return [];
              return [project(insert(), selection)];
            },
          }),
        };
      },
    }),
    update: () => ({
      set: (values: Partial<StoredRow>) => ({
        where: (predicate: Predicate) => ({
          returning: async (selection: Record<string, Column>) => {
            const updated: StoredRow[] = [];
            harness.rows = harness.rows.map((row) => {
              if (!predicate(row)) return row;
              const next = { ...row, ...values };
              updated.push(next);
              return next;
            });
            return updated.map((row) => project(row, selection));
          },
        }),
      }),
    }),
  }),
}));

import {
  approveTvPairing,
  consumeTvPairing,
  normalizeTvPairingCode,
  startTvPairing,
  TvPairingCodeError,
  TvPairingRateLimitError,
} from "./tv-pairing";

function challengeRow() {
  return harness.rows.find((row) =>
    row.identifier.startsWith("tv-pairing:pending:"),
  );
}

describe("TV pairing", () => {
  beforeEach(() => {
    harness.rows = [];
    harness.minted = 0;
  });

  it("normalizes the displayed user code without changing its identity", () => {
    expect(normalizeTvPairingCode("abcde-fghij")).toBe("ABCDEFGHIJ");
    expect(normalizeTvPairingCode(" AB CD-23 ")).toBe("ABCD23");
  });

  it("issues a hashed challenge and leaves an unapproved poll pending", async () => {
    const challenge = await startTvPairing(
      new Headers({ "x-vercel-forwarded-for": "203.0.113.8" }),
    );
    const stored = challengeRow();

    expect(challenge.userCode).toHaveLength(10);
    expect(challenge.displayCode).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(stored?.token).not.toBe(challenge.deviceCode);
    expect(stored?.identifier).toBe(`tv-pairing:pending:${challenge.userCode}`);
    expect(
      await consumeTvPairing(new Headers(), challenge.deviceCode),
    ).toBeNull();
    expect(challengeRow()).toEqual(stored);
    expect(harness.minted).toBe(0);
  });

  it("rejects an unknown credential without consuming the approved challenge", async () => {
    const challenge = await startTvPairing();
    await approveTvPairing("user-1", challenge.displayCode);

    expect(
      await consumeTvPairing(new Headers(), "x".repeat(43)),
    ).toBeNull();
    expect(harness.minted).toBe(0);

    const session = await consumeTvPairing(new Headers(), challenge.deviceCode);
    expect(session).toMatchObject({
      token: "session-for-user-1",
      userId: "user-1",
    });
    expect(harness.minted).toBe(1);
  });

  it("atomically permits only one concurrent consume and rejects replay", async () => {
    const challenge = await startTvPairing();
    await approveTvPairing("user-1", challenge.userCode);

    const results = await Promise.all([
      consumeTvPairing(new Headers(), challenge.deviceCode),
      consumeTvPairing(new Headers(), challenge.deviceCode),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(harness.minted).toBe(1);
    expect(
      await consumeTvPairing(new Headers(), challenge.deviceCode),
    ).toBeNull();
    expect(harness.minted).toBe(1);
  });

  it("rejects expired and unknown approval codes", async () => {
    const challenge = await startTvPairing();
    const stored = challengeRow();
    if (!stored) throw new Error("Test challenge was not stored");
    stored.expires = new Date(Date.now() - 1);

    await expect(
      approveTvPairing("user-1", challenge.userCode),
    ).rejects.toBeInstanceOf(TvPairingCodeError);
    await expect(
      approveTvPairing("user-1", "NOT-A-CODE"),
    ).rejects.toBeInstanceOf(TvPairingCodeError);
    expect(
      await consumeTvPairing(new Headers(), challenge.deviceCode),
    ).toBeNull();
    expect(harness.minted).toBe(0);
  });

  it("bounds public pairing starts per client", async () => {
    const headers = new Headers({
      "x-vercel-forwarded-for": "198.51.100.4",
    });
    for (let request = 0; request < 6; request += 1) {
      await startTvPairing(headers);
    }
    await expect(startTvPairing(headers)).rejects.toBeInstanceOf(
      TvPairingRateLimitError,
    );
    expect(
      harness.rows.filter((row) =>
        row.identifier.startsWith("tv-pairing:pending:"),
      ),
    ).toHaveLength(6);
  });

  it("bounds pairing starts globally across distinct clients", async () => {
    for (let request = 0; request < 120; request += 1) {
      await startTvPairing(
        new Headers({
          "x-vercel-forwarded-for": `198.51.${Math.floor(request / 256)}.${request % 256}`,
        }),
      );
    }
    await expect(
      startTvPairing(
        new Headers({ "x-vercel-forwarded-for": "203.0.113.250" }),
      ),
    ).rejects.toBeInstanceOf(TvPairingRateLimitError);
  });
});
