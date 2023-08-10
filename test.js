const flat = require('./index')

const depsTree = flat.getVueDepsTree(
  path.resolve(__dirname, "./src/main.js"),
  "./src/main.js"
);

flat.writeFlatFiles(depsTree, "./temp")