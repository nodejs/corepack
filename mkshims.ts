import cmdShim from '@zkochan/cmd-shim';
import {writeFileSync} from 'fs';

import {entries} from './sources/entries';

Promise.all(entries.map(async ([name]) => {
    return cmdShim(`${__dirname}/dist/main.js`, `${__dirname}/dist/${name}`, {progArgs: [name]});
})).then(() => {
    console.log(`All shims have been generated.`);
}, err => {
    console.error(err.stack);
});
