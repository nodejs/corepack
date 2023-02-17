import {readFileSync} from 'fs';
import semver         from 'semver';

const lines = readFileSync(0, `utf8`).split(/\n/).filter(line => line);

lines.sort((a, b) => {
  return semver.compare(a, b);
});

for (const version of lines)
  console.log(`"${version}": "${process.argv[2]}",`);
