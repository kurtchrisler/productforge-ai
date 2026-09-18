import { ProductContent, ProductTypeId, PRODUCT_TYPES } from "./productTypes";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderProductHtml(
  content: ProductContent,
  type: ProductTypeId,
  coverImageDataUri?: string | null
): string {
  const meta = PRODUCT_TYPES[type];
  const accent = meta.accent;
  const accentSoft = meta.accentSoft;

  // With AI cover art: a dark gradient scrim over the photo/illustration so
  // the white cover text stays legible, image itself filling the page.
  // Without it (demo mode, or image generation failed): the original
  // brand-accent gradient.
  const coverBackground = coverImageDataUri
    ? `linear-gradient(190deg, rgba(17,24,39,0.15) 0%, rgba(17,24,39,0.92) 92%), url('${coverImageDataUri}')`
    : `linear-gradient(160deg, ${accent} 0%, #111827 120%)`;

  const sectionsHtml = content.sections
    .map((section, i) => {
      const bullets =
        section.bullets && section.bullets.length
          ? `<ul class="bullets">${section.bullets
              .map((b) => `<li>${esc(b)}</li>`)
              .join("")}</ul>`
          : "";

      const worksheet =
        section.worksheet && section.worksheet.length
          ? `<div class="worksheet">
              ${section.worksheet
                .map(
                  (w) =>
                    `<div class="worksheet-line"><span class="worksheet-label">${esc(
                      w
                    )}</span></div>`
                )
                .join("")}
            </div>`
          : "";

      const bodyParagraphs = section.body
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${esc(p)}</p>`)
        .join("");

      return `
        <section class="content-section">
          <div class="section-number">${meta.sectionNoun.toUpperCase()} ${
            i + 1
          }</div>
          <h2>${esc(section.heading)}</h2>
          ${bodyParagraphs}
          ${bullets}
          ${worksheet}
        </section>`;
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
    font-family: 'Georgia', 'Times New Roman', serif;
    color: #1f2430;
    background: #ffffff;
  }
  h1, h2, h3, .section-number, .cover-badge, .worksheet-label {
    font-family: 'Helvetica Neue', Arial, sans-serif;
  }
  .page {
    width: 8.5in;
    min-height: 11in;
    padding: 0.85in 0.9in;
    margin: 0 auto;
    page-break-after: always;
    position: relative;
  }
  .cover {
    background: ${coverBackground};
    background-size: cover;
    background-position: center;
    color: #ffffff;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
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
  .cover h1 {
    font-size: 42px;
    line-height: 1.15;
    margin: 0 0 18px 0;
    max-width: 6.4in;
  }
  .cover .subtitle {
    font-size: 19px;
    opacity: 0.92;
    max-width: 5.8in;
    line-height: 1.5;
    margin-bottom: 40px;
  }
  .cover .tagline {
    font-size: 14px;
    opacity: 0.75;
    border-top: 1px solid rgba(255,255,255,0.3);
    padding-top: 16px;
    max-width: 5in;
  }
  .intro h2 {
    font-size: 13px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${accent};
    margin-bottom: 18px;
  }
  .intro p {
    font-size: 17px;
    line-height: 1.75;
    color: #2b2f3a;
  }
  .content-section {
    page-break-inside: avoid;
    margin-bottom: 46px;
  }
  .section-number {
    font-size: 11px;
    letter-spacing: 0.14em;
    color: ${accent};
    font-weight: 700;
    margin-bottom: 8px;
  }
  .content-section h2 {
    font-size: 25px;
    margin: 0 0 14px 0;
    color: #14151a;
    border-bottom: 2px solid ${accentSoft};
    padding-bottom: 10px;
  }
  .content-section p {
    font-size: 15.5px;
    line-height: 1.75;
    color: #2b2f3a;
    margin-bottom: 14px;
  }
  .bullets {
    margin: 0 0 16px 0;
    padding-left: 22px;
  }
  .bullets li {
    font-size: 14.5px;
    line-height: 1.7;
    margin-bottom: 6px;
    color: #2b2f3a;
  }
  .worksheet {
    background: ${accentSoft};
    border: 1px solid ${accentSoft};
    border-radius: 10px;
    padding: 16px 20px;
    margin-top: 10px;
  }
  .worksheet-line {
    padding: 9px 0;
    border-bottom: 1px dashed rgba(0,0,0,0.2);
    font-size: 13.5px;
    color: #4b4f5b;
  }
  .worksheet-line:last-child { border-bottom: none; }
  .closing {
    background: #14151a;
    color: #ffffff;
  }
  .closing h2 {
    font-size: 13px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${accent};
    margin-bottom: 18px;
  }
  .closing p {
    font-size: 16px;
    line-height: 1.75;
    color: rgba(255,255,255,0.9);
    margin-bottom: 26px;
  }
  .closing .cta {
    display: inline-block;
    background: ${accent};
    color: #ffffff;
    padding: 12px 22px;
    border-radius: 8px;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 14px;
    font-weight: 600;
  }
  .last-page { page-break-after: auto; }
</style>
</head>
<body>

  <div class="page cover">
    <div class="cover-badge">${esc(meta.label)}</div>
    <h1>${esc(content.title)}</h1>
    <div class="subtitle">${esc(content.subtitle)}</div>
    <div class="tagline">${esc(content.tagline)}</div>
  </div>

  <div class="page intro">
    <h2>Introduction</h2>
    <p>${esc(content.introduction)}</p>
  </div>

  <div class="page">
    ${sectionsHtml}
  </div>

  <div class="page closing last-page">
    <h2>Final Word</h2>
    <p>${esc(content.conclusion)}</p>
    <div class="cta">${esc(content.callToAction)}</div>
  </div>

</body>
</html>`;
}
