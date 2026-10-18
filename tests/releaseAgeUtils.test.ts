import {afterEach, beforeEach, describe, expect, it, vi}       from 'vitest';

import {filterVersionsByAge, getMinimumReleaseAge, resolveTag} from '../sources/releaseAgeUtils.ts';

describe(`getMinimumReleaseAge`, () => {
  it(`defaults to zero when unset`, () => {
    expect(getMinimumReleaseAge()).toBe(0);
  });

  it.each([``, `0`, `00`, `60`, `1440`])(`accepts %j`, value => {
    process.env.COREPACK_MINIMUM_RELEASE_AGE = value;
    expect(getMinimumReleaseAge()).toBe(Number(value));
  });

  it.each([`no`, `60m`, `1.5`, `-1`, `+1`, `NaN`, `Infinity`, `1e3`, `0x10`, ` `, ` 60 `, `9007199254740992`])(`rejects %j`, value => {
    process.env.COREPACK_MINIMUM_RELEASE_AGE = value;
    expect(getMinimumReleaseAge).toThrow(`COREPACK_MINIMUM_RELEASE_AGE must be a non-negative integer number of minutes`);
  });
});

describe(`release age filtering`, () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`2026-10-18T12:00:00Z`));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(`includes the cutoff and excludes newer and future releases`, () => {
    expect(filterVersionsByAge([`1.0.0`, `1.1.0`, `1.2.0`, `1.3.0`], {
      '1.0.0': `2026-10-17T12:00:00.000Z`,
      '1.1.0': `2026-10-18T11:00:00.000Z`,
      '1.2.0': `2026-10-18T11:00:00.001Z`,
      '1.3.0': `2026-10-19T12:00:00.000Z`,
    }, 60)).toEqual([`1.0.0`, `1.1.0`]);
  });

  it.each([undefined, null, {}, {created: `2020-01-01T00:00:00Z`}])(`excludes versions without publish timestamps: %j`, time => {
    expect(filterVersionsByAge([`1.0.0`], time, 60)).toEqual([]);
  });

  it.each([undefined, null, 0, true, {}, ``, `invalid`, `2020-13-01T00:00:00Z`, `2020-01-01`, `2020-01-01T00:00:00`])(`excludes invalid or ambiguous timestamps: %j`, published => {
    expect(filterVersionsByAge([`1.0.0`], {'1.0.0': published}, 60)).toEqual([]);
  });

  it(`compares timezone offsets as instants`, () => {
    expect(filterVersionsByAge([`1.0.0`, `1.1.0`, `1.2.0`], {
      '1.0.0': `2026-10-18T13:00:00+02:00`,
      '1.1.0': `2026-10-18T04:00:00-07:00`,
      '1.2.0': `2026-10-18T12:00:00-01:00`,
    }, 60)).toEqual([`1.0.0`, `1.1.0`]);
  });

  it(`does not require timestamps when disabled`, () => {
    expect(filterVersionsByAge([`1.0.0`, `1.1.0`], undefined, 0)).toEqual([`1.0.0`, `1.1.0`]);
  });

  it(`chooses the highest eligible stable version at or below a tag`, () => {
    expect(resolveTag(`pnpm`, `latest`, {
      tags: {latest: `2.0.0`, next: `3.0.0`},
      versions: [`1.0.0`, `3.0.0`, `1.2.0`, `1.1.0`, `1.3.0-beta.0`, `2.0.0`, `invalid`],
      time: {
        '1.0.0': `2026-10-18T10:00:00Z`,
        '1.1.0': `2026-10-17T12:00:00Z`,
        '1.2.0': `2026-10-16T12:00:00Z`,
        '1.3.0-beta.0': `2026-10-16T12:00:00Z`,
        '2.0.0': `2026-10-18T11:59:00Z`,
        '3.0.0': `2026-10-16T12:00:00Z`,
        invalid: `2026-10-16T12:00:00Z`,
      },
    }, 60)).toBe(`1.2.0`);
  });

  it(`retains an eligible tag even when higher versions exist`, () => {
    expect(resolveTag(`pnpm`, `latest`, {
      tags: {latest: `1.0.0`},
      versions: [`1.0.0`, `2.0.0`],
      time: {'1.0.0': `2026-10-16T12:00:00Z`, '2.0.0': `2026-10-16T12:00:00Z`},
    }, 60)).toBe(`1.0.0`);
  });

  it(`keeps prerelease tag fallback within its release and channel`, () => {
    const versions = [`1.9.0`, `2.0.0-beta.1`, `2.0.0-rc.0`, `2.0.0-rc.1`, `2.0.0-rc.2`, `2.1.0-rc.0`];
    expect(resolveTag(`pnpm`, `next`, {
      tags: {next: `2.0.0-rc.2`},
      versions,
      time: Object.fromEntries(versions.map(version => [version, version === `2.0.0-rc.2` ? `2026-10-18T11:59:00Z` : `2026-10-17T12:00:00Z`])),
    }, 60)).toBe(`2.0.0-rc.1`);
  });

  it(`fails when the tag has no eligible candidates`, () => {
    expect(() => resolveTag(`pnpm`, `latest`, {
      tags: {latest: `1.0.0`},
      versions: [`1.0.0`],
    }, 60)).toThrow(`No pnpm release older than 60 minutes is available for tag latest`);
  });

  it(`reports unknown tags separately`, () => {
    expect(() => resolveTag(`pnpm`, `unknown`, {tags: {latest: `1.0.0`}, versions: []}, 60)).toThrow(`Tag not found (unknown)`);
  });

  it(`does not filter tags when disabled`, () => {
    expect(resolveTag(`pnpm`, `latest`, {tags: {latest: `1.0.0`}, versions: []}, 0)).toBe(`1.0.0`);
  });
});
