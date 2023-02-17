#!/usr/bin/env node
import {runMain} from './main';

// Used by the generated shims
export {runMain};

if (process.mainModule === module)
  runMain(process.argv.slice(2));
