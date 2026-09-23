import { ColoringBookContent, PRODUCT_TYPES } from "./productTypes";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderColoringBookHtml(
  content: ColoringBookContent,
  pageDataUris: (string | null)[],
  coverImageDataUri?: string | null
): string {
  const meta = PRODUCT_TYPES.coloring_book;
  const accent = meta.accent;
  const coverGradient = `linear-gradient(160deg, ${accent} 0%, #111827 120%)`;

  const pagesHtml = content.pages
    .map((p, i) => {
      const num = i + 1;
      const img = pageDataUris[i];
      const isLast = i === content.pages.length - 1;
      return `
      <div class="page coloring-page${isLast ? " last-page" : ""}">
        ${
          img
            ? `<img class="coloring-img" src="${img}" alt="${esc(p.caption || `Page ${num}`)}" />`
            : `<div class="coloring-placeholder">
                 <div class="coloring-placeholder-icon">&#9998;</div>
                 <div class="coloring-placeholder-text">${esc(p.prompt)}</div>
               </div>`
        }
        <div class="coloring-caption">${esc(p.caption || `Page ${num}`)}</div>
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(content.title)}</title>
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #1f2430;
    background: #ffffff;
  }
  .page {
    width: 8.5in;
    min-height: 11in;
    margin: 0 auto;
    page-break-after: always;
    position: relative;
  }
  .cover {
    background: ${coverGradient};
    color: #ffffff;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    padding: 0.85in 0.9in;
  }
  .cover.cover-image {
    /* Same reasoning as the ebook/puzzle cover renderers: the AI art is a
       fixed portrait ratio that doesn't exactly match the page, so it's
       shown with object-fit:contain (never cropped) inside a dark
       letterboxed frame. */
    height: 11in;
    padding: 0;
    background: #0b0f19;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cover-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  .cover-badge {
    display: inline-block;
    background: rgba(255,255,255,0.15);
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 28px;
  }
  .cover h1 { font-size: 40px; line-height: 1.15; margin: 0 0 18px 0; max-width: 6.4in; }
  .cover .subtitle { font-size: 18px; opacity: 0.92; max-width: 5.8in; line-height: 1.5; margin-bottom: 34px; }
  .cover .tagline { font-size: 13px; opacity: 0.75; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 14px; max-width: 5in; }

  .coloring-page {
    padding: 0.4in;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
  }
  .coloring-img {
    width: 100%;
    max-height: 9.6in;
    object-fit: contain;
    border: 1px solid #e4e6ea;
  }
  .coloring-placeholder {
    width: 100%;
    height: 9.6in;
    border: 2px dashed #cbd0da;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0.6in;
    color: #6b7280;
  }
  .coloring-placeholder-icon { font-size: 40px; margin-bottom: 14px; }
  .coloring-placeholder-text { font-size: 13px; line-height: 1.6; max-width: 5in; }
  .coloring-caption {
    margin-top: 0.25in;
    font-size: 13px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${accent};
    font-weight: 700;
  }

  .last-page { page-break-after: auto; }
</style>
</head>
<body>

  <div class="page cover${coverImageDataUri ? " cover-image" : ""}">
    ${
      coverImageDataUri
        ? `<img class="cover-img" src="${coverImageDataUri}" alt="${esc(content.title)}" />`
        : `<div class="cover-badge">${esc(meta.label)}</div>
    <h1>${esc(content.title)}</h1>
    <div class="subtitle">${esc(content.subtitle)}</div>
    <div class="tagline">${esc(content.tagline)}</div>`
    }
  </div>

  ${pagesHtml}

</body>
</html>`;
}
