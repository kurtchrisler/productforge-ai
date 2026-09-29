import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs";
import path from "path";

// The training video is a large, mostly-static asset, so it's kept out of
// git the same way generated PDFs/covers/EPUBs are: it lives on the server
// at data/training/product-genie-training.mp4 (outside version control —
// see .gitignore's /data/ rule) and is uploaded there directly rather than
// riding along in a git-based deploy. Range requests are supported so the
// <video> player can seek without downloading the whole file up front.
const VIDEO_PATH = path.join(
  process.cwd(),
  "data",
  "training",
  "product-genie-training.mp4"
);

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!fs.existsSync(VIDEO_PATH)) {
    return NextResponse.json(
      { error: "Training video not found." },
      { status: 404 }
    );
  }

  const stat = fs.statSync(VIDEO_PATH);
  const fileSize = stat.size;
  const range = req.headers.get("range");

  if (!range) {
    const fileBuffer = fs.readFileSync(VIDEO_PATH);
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const match = range.match(/bytes=(\d+)-(\d*)/);
  const start = match ? parseInt(match[1], 10) : 0;
  const end =
    match && match[2]
      ? Math.min(parseInt(match[2], 10), fileSize - 1)
      : Math.min(start + 5 * 1024 * 1024, fileSize - 1);
  const chunkSize = end - start + 1;

  const fd = fs.openSync(VIDEO_PATH, "r");
  const buffer = Buffer.alloc(chunkSize);
  fs.readSync(fd, buffer, 0, chunkSize, start);
  fs.closeSync(fd);

  return new NextResponse(new Uint8Array(buffer), {
    status: 206,
    headers: {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(chunkSize),
      "Content-Type": "video/mp4",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
