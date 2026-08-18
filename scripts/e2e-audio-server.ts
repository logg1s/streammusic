import { createServer } from "node:http";

const port = Number(process.env.VONG_E2E_AUDIO_PORT ?? "41731");
// Keep each deterministic fixture below 1 MiB while leaving enough time for the
// slower uiautomator snapshots on an emulator to observe playback and skip-next.
const durationSec = 60;
const sampleRate = 8_000;

function wav(frequency: number): Buffer {
  const samples = sampleRate * durationSec;
  const out = Buffer.alloc(44 + samples * 2);
  out.write("RIFF", 0);
  out.writeUInt32LE(out.length - 8, 4);
  out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1) {
    const fade = Math.min(1, i / 500, (samples - i) / 500);
    out.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 5000 * fade),
      44 + i * 2,
    );
  }
  return out;
}

const files = new Map([
  ["/mot.wav", wav(440)],
  ["/hai.wav", wav(554)],
  ["/ba.wav", wav(659)],
]);

const commonHeaders = {
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
};

createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { ...commonHeaders, "content-type": "text/plain" }).end("ok");
    return;
  }
  const body = files.get(request.url ?? "");
  if (!body) {
    response.writeHead(404).end();
    return;
  }

  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) {
      response.writeHead(416, { "content-range": `bytes */${body.length}` }).end();
      return;
    }
    const start = Number(match[1]);
    const end = Math.min(match[2] ? Number(match[2]) : body.length - 1, body.length - 1);
    response.writeHead(206, {
      ...commonHeaders,
      "accept-ranges": "bytes",
      "content-length": end - start + 1,
      "content-range": `bytes ${start}-${end}/${body.length}`,
      "content-type": "audio/wav",
    });
    response.end(body.subarray(start, end + 1));
    return;
  }

  response.writeHead(200, {
    ...commonHeaders,
    "accept-ranges": "bytes",
    "content-length": body.length,
    "content-type": "audio/wav",
  });
  response.end(body);
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Vọng E2E audio ready on ${port}\n`);
});
