import {runMain} from './main';

// Used by the generated shims
export {runMain};

// Using `eval` to be sure that Webpack doesn't transform it
if (process.mainModule === eval(`module`))
  runMain(process.argv.slice(2));
