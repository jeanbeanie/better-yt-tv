import { tagName } from "./version.mjs";

const RELEASE_MARKER = "**Released";
const DATE_HEADING_RE = /^## (\d{4}-\d{2}-\d{2})\s*$/;

export function releaseMarkerText(version) {
  return `**Released ${tagName(version)}**`;
}

export function hasReleaseMarker(changelogText, version) {
  return changelogText.includes(releaseMarkerText(version));
}

function bulletsIn(lines, from, to) {
  return lines
    .slice(from, to)
    .filter((line) => line.startsWith("- ") && !line.includes(RELEASE_MARKER))
    .map((line) => line.slice(2));
}

// newest marker M. bullets in newer sections above M's section count, and
// bullets below M inside its own section count. bullets above M in its section
// were already released. no marker means every bullet counts
export function entriesSinceLastRelease(changelogText) {
  const lines = changelogText.split("\n");
  const markerIndex = lines.findIndex((line) => line.includes(RELEASE_MARKER));
  if (markerIndex === -1) return bulletsIn(lines, 0, lines.length);

  let sectionStart = -1;
  for (let i = markerIndex - 1; i >= 0; i--) {
    if (lines[i].startsWith("## ")) {
      sectionStart = i;
      break;
    }
  }
  let sectionEnd = lines.findIndex((line, i) => i > markerIndex && line.startsWith("## "));
  if (sectionEnd === -1) sectionEnd = lines.length;

  const newerSections = bulletsIn(lines, 0, Math.max(sectionStart, 0));
  const belowMarker = bulletsIn(lines, markerIndex + 1, sectionEnd);
  return [...newerSections, ...belowMarker];
}

function isPatchEntry(entry) {
  return entry.split(" ")[0] === "Fixed" || entry.startsWith("Behind the scenes");
}

// null when there are no entries
export function suggestBump(entries) {
  if (entries.length === 0) return null;
  return entries.every(isPatchEntry) ? "patch" : "minor";
}

// marker goes after the last bullet of today's section, else a new top section
export function addReleaseMarker(changelogText, version, isoDate) {
  const marker = `- ${releaseMarkerText(version)}`;
  const lines = changelogText.split("\n");
  const topIndex = lines.findIndex((line) => DATE_HEADING_RE.test(line));

  if (topIndex !== -1 && DATE_HEADING_RE.exec(lines[topIndex])[1] === isoDate) {
    let sectionEnd = lines.findIndex((line, i) => i > topIndex && line.startsWith("## "));
    if (sectionEnd === -1) sectionEnd = lines.length;
    let last = sectionEnd - 1;
    while (last > topIndex && lines[last].trim() === "") last--;
    lines.splice(last + 1, 0, marker);
    return lines.join("\n");
  }

  const insertAt = topIndex === -1 ? 0 : topIndex;
  lines.splice(insertAt, 0, `## ${isoDate}`, "", marker, "");
  return lines.join("\n");
}
