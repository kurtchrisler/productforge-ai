import path from "path";
import fs from "fs";
import crypto from "crypto";
import archiver from "archiver";
import { ProductContent, ProductTypeId, PRODUCT_TYPES } from "./productTypes";

const epubDir = path.join(process.cwd(), "data", "epubs");

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function paragraphs(body: string): string {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("\n");
}

function wrapXhtml(title: string, bodyHtml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

type ManifestItem = {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
};

type Chapter = {
  id: string;
  href: string;
  title: string;
  xhtml: string;
  inToc: boolean;
};

const STYLES_CSS = `body {
  font-family: 'Georgia', 'Times New Roman', serif;
  line-height: 1.6;
  margin: 0;
  padding: 0 1.2em;
  color: #1a1a1a;
}
h1 {
  font-family: 'Helvetica', 'Arial', sans-serif;
  font-size: 1.5em;
  line-height: 1.25;
  margin: 1.3em 0 0.6em 0;
}
p { margin: 0 0 1em 0; }
.cover { text-align: center; margin: 0; padding: 0; }
.cover-img { width: 100%; height: auto; }
.titlepage { text-align: center; margin-top: 3.5em; }
.titlepage h1 { font-size: 2em; margin-top: 0.4em; }
.titlepage .subtitle { font-size: 1.1em; color: #444; margin-top: 0.4em; }
.titlepage .tagline { font-size: 0.9em; color: #777; margin-top: 2em; font-style: italic; }
.badge, .kicker {
  font-family: 'Helvetica', 'Arial', sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.75em;
  color: #555;
  margin: 0;
}
.bullets, .checklist, .worksheet {
  margin: 0 0 1.2em 0;
  padding-left: 1.4em;
}
.checklist { list-style: none; padding-left: 0.2em; }
.checklist li:before { content: "\\2610\\a0\\a0"; }
.worksheet { list-style: none; padding-left: 0.2em; }
.worksheet li { border-bottom: 1px dashed #999; padding: 0.35em 0; }
.cta {
  font-weight: bold;
  margin-top: 2em;
  padding: 0.8em 1em;
  border: 1px solid #ccc;
  display: inline-block;
}
`;

function buildSectionXhtml(
  heading: string,
  sectionNoun: string,
  index: number,
  body: string,
  bullets: string[] | undefined,
  worksheet: string[] | undefined,
  checklistStyle: boolean
): string {
  const bulletsHtml =
    bullets && bullets.length
      ? checklistStyle
        ? `<ul class="checklist">${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
        : `<ul class="bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
      : "";
  const worksheetHtml =
    worksheet && worksheet.length
      ? `<ul class="worksheet">${worksheet.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
      : "";

  return `<p class="kicker">${esc(sectionNoun.toUpperCase())} ${index + 1}</p>
<h1>${esc(heading)}</h1>
${paragraphs(body)}
${bulletsHtml}
${worksheetHtml}`;
}

// Assembles a valid, KDP-uploadable EPUB 3 file (reflowable text) from a
// document-kind product's content — the same content that produced the PDF,
// repackaged as chapters instead of fixed print pages. Written by hand
// (mimetype/container.xml/OPF/nav/NCX/XHTML) rather than via a templating
// library, so we have full control over exactly what goes in the package
// and can keep it in lockstep with lib/render.ts's content model.
export async function generateEpub(
  content: ProductContent,
  type: ProductTypeId,
  coverImageBuffer: Buffer | null,
  productId: number
): Promise<string> {
  if (!fs.existsSync(epubDir)) {
    fs.mkdirSync(epubDir, { recursive: true });
  }

  const meta = PRODUCT_TYPES[type];
  const chapters: Chapter[] = [];

  if (coverImageBuffer) {
    chapters.push({
      id: "cover",
      href: "cover.xhtml",
      title: "Cover",
      inToc: false,
      xhtml: wrapXhtml(
        content.title,
        `<div class="cover"><img src="images/cover.png" alt="${esc(content.title)}" class="cover-img"/></div>`
      ),
    });
  } else {
    chapters.push({
      id: "titlepage",
      href: "titlepage.xhtml",
      title: "Title Page",
      inToc: false,
      xhtml: wrapXhtml(
        content.title,
        `<div class="titlepage">
<p class="badge">${esc(meta.label)}</p>
<h1>${esc(content.title)}</h1>
<p class="subtitle">${esc(content.subtitle)}</p>
<p class="tagline">${esc(content.tagline)}</p>
</div>`
      ),
    });
  }

  if (content.introduction.trim()) {
    chapters.push({
      id: "intro",
      href: "intro.xhtml",
      title: "Introduction",
      inToc: true,
      xhtml: wrapXhtml("Introduction", `<h1>Introduction</h1>\n${paragraphs(content.introduction)}`),
    });
  }

  content.sections.forEach((section, i) => {
    const chapterTitle = section.heading || `${meta.sectionNoun} ${i + 1}`;
    chapters.push({
      id: `chap${i + 1}`,
      href: `chap${i + 1}.xhtml`,
      title: chapterTitle,
      inToc: true,
      xhtml: wrapXhtml(
        chapterTitle,
        buildSectionXhtml(
          chapterTitle,
          meta.sectionNoun,
          i,
          section.body,
          section.bullets,
          section.worksheet,
          meta.checklistStyle
        )
      ),
    });
  });

  if (content.conclusion.trim() || content.callToAction.trim()) {
    chapters.push({
      id: "closing",
      href: "closing.xhtml",
      title: "Final Word",
      inToc: true,
      xhtml: wrapXhtml(
        "Final Word",
        `<h1>Final Word</h1>\n${paragraphs(content.conclusion)}${
          content.callToAction.trim() ? `\n<p class="cta">${esc(content.callToAction)}</p>` : ""
        }`
      ),
    });
  }

  const manifestItems: ManifestItem[] = [
    { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
    { id: "css", href: "styles.css", mediaType: "text/css" },
    { id: "ncx", href: "toc.ncx", mediaType: "application/x-dtbncx+xml" },
    ...(coverImageBuffer
      ? [{ id: "cover-image", href: "images/cover.png", mediaType: "image/png", properties: "cover-image" }]
      : []),
    ...chapters.map((c) => ({ id: c.id, href: c.href, mediaType: "application/xhtml+xml" })),
  ];

  const spineIds = chapters.map((c) => c.id);
  const tocChapters = chapters.filter((c) => c.inToc);

  const uuid = `urn:uuid:${crypto.randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  const manifestXml = manifestItems
    .map(
      (item) =>
        `    <item id="${item.id}" href="${item.href}" media-type="${item.mediaType}"${
          item.properties ? ` properties="${item.properties}"` : ""
        }/>`
    )
    .join("\n");

  const spineXml = spineIds.map((id) => `    <itemref idref="${id}"/>`).join("\n");

  const opfXml = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${uuid}</dc:identifier>
    <dc:title>${esc(content.title)}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
${manifestXml}
  </manifest>
  <spine>
${spineXml}
  </spine>
</package>`;

  const navLis = tocChapters.map((c) => `      <li><a href="${c.href}">${esc(c.title)}</a></li>`).join("\n");
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
<meta charset="utf-8"/>
<title>Table of Contents</title>
<link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
<nav epub:type="toc" id="toc">
<h1>Table of Contents</h1>
<ol>
${navLis}
</ol>
</nav>
</body>
</html>`;

  const navPoints = tocChapters
    .map(
      (c, i) => `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${esc(c.title)}</text></navLabel>
      <content src="${c.href}"/>
    </navPoint>`
    )
    .join("\n");
  const ncxXml = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uuid}"/>
  </head>
  <docTitle><text>${esc(content.title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;

  const filename = `${productId}.epub`;
  const filePath = path.join(epubDir, filename);

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(filePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", (err) => reject(err));
    archive.pipe(output);

    // The mimetype file MUST be the first entry in the zip and MUST be
    // stored (not compressed) — this is a hard EPUB/OCF requirement that
    // some readers and validators check explicitly.
    archive.append("application/epub+zip", { name: "mimetype", store: true });
    archive.append(containerXml, { name: "META-INF/container.xml" });
    archive.append(opfXml, { name: "OEBPS/content.opf" });
    archive.append(navXhtml, { name: "OEBPS/nav.xhtml" });
    archive.append(ncxXml, { name: "OEBPS/toc.ncx" });
    archive.append(STYLES_CSS, { name: "OEBPS/styles.css" });
    if (coverImageBuffer) {
      archive.append(coverImageBuffer, { name: "OEBPS/images/cover.png" });
    }
    for (const chapter of chapters) {
      archive.append(chapter.xhtml, { name: `OEBPS/${chapter.href}` });
    }

    archive.finalize();
  });

  return filename;
}

export function deleteEpub(filename: string | null): void {
  if (!filename) return;
  const filePath = path.join(epubDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
