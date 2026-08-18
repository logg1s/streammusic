import { writeFile } from "node:fs/promises";
import { encode } from "@auth/core/jwt";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  albums,
  artists,
  connections,
  playlistItems,
  playlists,
  tracks,
  users,
} from "../src/db/schema";
import { issueHandoffCode } from "../src/lib/native-handoff";

const USER_ID = "vong-e2e-user";
const EMAIL = "e2e@vong.local";
const ARTIST_ID = "10000000-0000-4000-8000-000000000001";
const ALBUM_ID = "20000000-0000-4000-8000-000000000001";
const CONNECTION_ID = "30000000-0000-4000-8000-000000000001";
const PLAYLIST_ID = "40000000-0000-4000-8000-000000000001";
const TRACK_IDS = [
  "50000000-0000-4000-8000-000000000001",
  "50000000-0000-4000-8000-000000000002",
  "50000000-0000-4000-8000-000000000003",
];
const TITLES = ["Sóng Thử Nghiệm Một", "Sóng Thử Nghiệm Hai", "Sóng Thử Nghiệm Ba"];

function outputPath(): string {
  const index = process.argv.indexOf("--output");
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error("Thiếu --output <file>");
  return value;
}

async function seed() {
  const db = getDb();
  await db.delete(users).where(eq(users.id, USER_ID));
  await db.insert(users).values({ id: USER_ID, name: "Người nghe E2E", email: EMAIL });
  await db.insert(connections).values({
    id: CONNECTION_ID,
    userId: USER_ID,
    provider: "dropbox",
    providerAccountId: "e2e-fixture",
    label: "Kho nhạc E2E",
    accessTokenEnc: "fixture-never-used",
    scope: "e2e",
  });
  await db.insert(artists).values({ id: ARTIST_ID, userId: USER_ID, name: "Ban Nhạc E2E" });
  await db.insert(albums).values({
    id: ALBUM_ID,
    userId: USER_ID,
    artistId: ARTIST_ID,
    title: "Album Ổn Định",
    year: 2026,
  });

  const audioPort = Number(process.env.VONG_E2E_AUDIO_PORT ?? "41731");
  const expires = new Date("2099-01-01T00:00:00.000Z");
  await db.insert(tracks).values(
    TRACK_IDS.map((id, index) => ({
      id,
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      remoteId: `e2e-${index + 1}`,
      remoteRev: "1",
      path: `/e2e/${index + 1}.wav`,
      fileName: `${index + 1}.wav`,
      mimeType: "audio/wav",
      sizeBytes: 793_844,
      title: TITLES[index],
      artistId: ARTIST_ID,
      albumId: ALBUM_ID,
      artistName: "Ban Nhạc E2E",
      albumName: "Album Ổn Định",
      trackNo: index + 1,
      discNo: 1,
      durationSec: 60,
      bitrate: 352_800,
      codec: "PCM",
      genre: "Test",
      year: 2026,
      streamUrlCache: `http://127.0.0.1:${audioPort}/${["mot", "hai", "ba"][index]}.wav`,
      streamUrlExpiresAt: expires,
      addedAt: new Date(`2026-01-0${index + 1}T00:00:00.000Z`),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    })),
  );
  await db.insert(playlists).values({
    id: PLAYLIST_ID,
    userId: USER_ID,
    name: "Playlist E2E Ổn Định",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  await db.insert(playlistItems).values(
    TRACK_IDS.map((trackId, position) => ({ playlistId: PLAYLIST_ID, trackId, position })),
  );

  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Thiếu AUTH_SECRET");
  const token = await encode({
    salt: "authjs.session-token",
    secret,
    token: { sub: USER_ID, name: "Người nghe E2E", email: EMAIL },
  });
  await writeFile(
    outputPath(),
    JSON.stringify({
      userId: USER_ID,
      cookie: { name: "authjs.session-token", value: token },
      trackIds: TRACK_IDS,
      titles: TITLES,
      playlistName: "Playlist E2E Ổn Định",
    }),
    "utf8",
  );
}

async function handoff() {
  const code = await issueHandoffCode(USER_ID);
  await writeFile(outputPath(), JSON.stringify({ code }), "utf8");
}

const command = process.argv[2];
(command === "seed" ? seed() : command === "handoff" ? handoff() : Promise.reject(new Error("Lệnh phải là seed hoặc handoff")))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
