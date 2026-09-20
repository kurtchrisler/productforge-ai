import { InfographicContent } from "./productTypes";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// A single-image infographic (not a PDF), sized for sharing on social /
// Pinterest-style platforms.
export const INFOGRAPHIC_WIDTH = 1080;
export const INFOGRAPHIC_HEIGHT = 1350;

export function renderInfographicHtml(content: InfographicContent): string {
  const statsHtml = content.stats
    .map(
      (s) => `
    <div class="stat">
      <div class="stat-value">${esc(s.value)}</div>
      <div class="stat-label">${esc(s.label)}</div>
    </div>`
    )
    .join("");

  const pointsHtml = content.points
    .map(
      (p, i) => `
    <div class="point">
      <div class="point-num">${i + 1}</div>
      <div class="point-text">${esc(p)}</div>
    </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(content.title)}</title>
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: ${INFOGRAPHIC_WIDTH}px;
    height: ${INFOGRAPHIC_HEIGHT}px;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    background: linear-gradient(160deg, #1c1917 0%, #431407 120%);
    color: #ffffff;
    overflow: hidden;
  }
  .wrap {
    padding: 56px 52px;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .eyebrow {
    display: inline-block;
    align-self: flex-start;
    background: rgba(255,255,255,0.12);
    padding: 6px 16px;
    border-radius: 999px;
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 20px;
  }
  h1 { font-size: 46px; line-height: 1.15; margin: 0 0 12px 0; }
  .subtitle { font-size: 19px; opacity: 0.85; line-height: 1.5; margin-bottom: 32px; max-width: 900px; }
  .stats { display: flex; gap: 16px; margin-bottom: 36px; }
  .stat {
    flex: 1;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 16px;
    padding: 20px 16px;
    text-align: center;
  }
  .stat-value { font-size: 34px; font-weight: 800; color: #fb923c; }
  .stat-label { font-size: 12.5px; opacity: 0.85; margin-top: 6px; line-height: 1.4; }
  .points { display: flex; flex-direction: column; gap: 16px; margin-bottom: 8px; }
  .point { display: flex; align-items: flex-start; gap: 16px; }
  .point-num {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #fb923c;
    color: #1c1917;
    font-weight: 800;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .point-text { font-size: 18px; line-height: 1.5; padding-top: 5px; }
  .footer {
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid rgba(255,255,255,0.2);
    font-size: 12.5px;
    opacity: 0.65;
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="eyebrow">Infographic</div>
    <h1>${esc(content.title)}</h1>
    <div class="subtitle">${esc(content.subtitle)}</div>
    <div class="stats">${statsHtml}</div>
    <div class="points">${pointsHtml}</div>
    <div class="footer">${esc(content.footerNote)}</div>
  </div>
</body>
</html>`;
}
