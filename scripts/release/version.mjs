const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const VERSION_FIELD_RE = /^(\s*"version"\s*:\s*")[^"]*(")/m;

export function isVersion(text) {
  return VERSION_RE.test(text);
}

export function parseVersion(text) {
  const match = VERSION_RE.exec(text);
  if (!match) throw new Error(`Not an X.Y.Z version: ${text}`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (const key of ["major", "minor", "patch"]) {
    if (x[key] !== y[key]) return x[key] < y[key] ? -1 : 1;
  }
  return 0;
}

export function bumpVersion(version, kind) {
  const { major, minor, patch } = parseVersion(version);
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump: ${kind}`);
}

export function tagName(version) {
  return `v${version}`;
}

export function readPackageVersion(packageText) {
  const { version } = JSON.parse(packageText);
  parseVersion(version);
  return version;
}

// replaces only the value of the first top level version field
export function setPackageVersion(packageText, version) {
  const updated = packageText.replace(VERSION_FIELD_RE, `$1${version}$2`);
  if (updated === packageText) throw new Error("No version field in package.json");
  return updated;
}
