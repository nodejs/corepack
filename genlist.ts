import {readFileSync} from 'fs';
import semverCompare  from 'semver/functions/compare';

const lines = readFileSync(0, `utf8`).split(/\n/).filter(line => line);

lines.sort((a, b) => {
  return semverCompare(a, b);
});

for (const version of lines)
  console.log(`"${version}": "${process.argv[2]}",`);
