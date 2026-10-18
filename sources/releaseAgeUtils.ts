import {UsageError}   from 'clipanion';
import semverParse    from 'semver/functions/parse.js';
import semverRcompare from 'semver/functions/rcompare.js';

export function getMinimumReleaseAge(): number {
  const value = process.env.COREPACK_MINIMUM_RELEASE_AGE;
  if (value === undefined || value === ``)
    return 0;

  const minutes = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(minutes))
    throw new UsageError(`COREPACK_MINIMUM_RELEASE_AGE must be a non-negative integer number of minutes`);

  return minutes;
}

export function filterVersionsByAge(versions: Array<string>, time: Record<string, unknown> | null | undefined, minimumReleaseAge: number): Array<string> {
  if (minimumReleaseAge === 0)
    return versions;

  const cutoff = Date.now() - minimumReleaseAge * 60_000;
  return versions.filter(version => {
    const published = time?.[version];
    // Require an explicit timezone so eligibility doesn't depend on the host's
    // timezone. Unknown or malformed timestamps must not bypass the gate.
    if (typeof published !== `string` || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(published))
      return false;

    return Date.parse(published) <= cutoff;
  });
}

export function resolveTag(packageName: string, tag: string, metadata: {
  tags: Record<string, string>;
  versions: Array<string>;
  time?: Record<string, unknown> | null;
}, minimumReleaseAge: number): string {
  if (!Object.hasOwn(metadata.tags, tag))
    throw new UsageError(`Tag not found (${tag})`);

  const taggedVersion = metadata.tags[tag];
  if (minimumReleaseAge === 0)
    return taggedVersion;

  const target = semverParse(taggedVersion);
  const candidates = filterVersionsByAge(metadata.versions, metadata.time, minimumReleaseAge).filter(version => {
    const candidate = semverParse(version);
    if (!target || !candidate || candidate.compare(target) > 0)
      return false;

    // Tags have no history in registry metadata. Never advance beyond the tag
    // or switch a stable tag to a prerelease. For prerelease tags, stay within
    // the same release and channel (e.g. 2.0.0-rc.*).
    return target.prerelease.length === 0
      ? candidate.prerelease.length === 0
      : candidate.major === target.major && candidate.minor === target.minor && candidate.patch === target.patch && candidate.prerelease[0] === target.prerelease[0];
  });

  const version = candidates.sort(semverRcompare)[0];
  if (version === undefined)
    throw new UsageError(`No ${packageName} release older than ${minimumReleaseAge} minutes is available for tag ${tag}`);

  return version;
}
