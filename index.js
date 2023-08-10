const fs = require("fs");
const path = require("path");
const util = require("util");

// 判断是否为本地文件而不是node_modules下的文件
function isLocalImport(path) {
  return (
    path[0] === "." ||
    (path[0] === "/" && path[1] === "/") ||
    (path[0] === "/" && path[1] === "*") ||
    (path[0] === "{" && path[path.length - 1] === "}")
  );
}

const isVueOrJs = (filePath) => {
  return path.extname(filePath) === ".vue" || path.extname(filePath) === ".js";
};

const isCss = (filePath) => {
  return (
    (path.extname(filePath) === ".css") |
    (path.extname(filePath) === ".scss") |
    (path.extname(filePath) === ".less")
  );
};

// 获取路径文件名，支持\\和/两种路径分隔符
function getFileName(path) {
  const pathArr = path.split(/\\|\//);
  return pathArr[pathArr.length - 1];
}

// 获取vue和js文件的依赖目录树，
const vueDeps = (filePath) => {
  console.log(filePath);
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const reg = /import\s+(.+)\s+from\s+(['"])(.+)\2/g;
  const deps = {};
  let result = null;
  while ((result = reg.exec(fileContent)) !== null) {
    deps[result[1]] = result[3];
  }
  console.log(deps);
  return deps;
};

// 替换vue和js文件的依赖目录，将最后的那个文件名改为name
const replaceVueDeps = (filePath, previous, name) => {
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const reg = /import\s+(.+)\s+from\s+(['"])(.+)\2/g;
  const deps = {};
  let result = null;
  while ((result = reg.exec(fileContent)) !== null) {
    if (result[3] === previous) {
      const newFileContent = fileContent.replace(
        result[0],
        `import ${result[1]} from './${getFileName(name)}'`
      );
      fs.writeFileSync(filePath, newFileContent);
    }
  }
  return deps;
};

// 获取css文件的依赖目录树
const cssDeps = (filePath) => {
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const reg = /@import\s+(['"])(.+)\1/g;
  const deps = {};
  let result = null;
  while ((result = reg.exec(fileContent)) !== null) {
    deps[result[2]] = result[2];
  }
  return deps;
};

const replaceCssDeps = (filePath, previous, name) => {
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const reg = /@import\s+(['"])(.+)\1/g;
  const deps = {};
  let result = null;
  while ((result = reg.exec(fileContent)) !== null) {
    if (result[2] === previous) {
      const newFileContent = fileContent.replace(
        result[0],
        `@import './${getFileName(name)}'`
      );
      fs.writeFileSync(filePath, newFileContent);
    }
  }
  return deps;
};

const addNumberToFileName = (fileName, number) => {
  const nameArr = fileName.split(".");
  nameArr[nameArr.length - 2] += number;
  return nameArr.join(".");
};

const transformPath = (filePath, parentPath) => {
  if (parentPath) {
    filePath = path.resolve(__dirname, path.dirname(parentPath), filePath);
  }
  const extNameList = [".js", ".vue", ".css", ".scss", ".less"];
  // 判断省略后缀名的写法
  if (!fs.existsSync(filePath)) {
    extNameList.some((ext) => {
      if (fs.existsSync(filePath + ext)) {
        filePath = filePath + ext;
        return true;
      }
      return false;
    });
  }
  const stats = fs.statSync(filePath);
  // 判断文件夹下默认index的写法
  if (stats.isDirectory()) {
    const files = fs.readdirSync(filePath);
    const indexList = extNameList.map((ext) => "index" + ext);
    indexList.some((item) => {
      if (files.includes(item)) {
        filePath = path.join(filePath, item);
        return true;
      }
      return false;
    });
  }
  return filePath;
};

const getVueDepsTree = (filePath, parentPath = "") => {
  filePath = transformPath(filePath);
  const deps = {
    ...vueDeps(filePath),
    ...cssDeps(filePath),
  };
  const depsTree = {};
  for (const key in deps) {
    if (isLocalImport(deps[key])) {
      // 获取绝对路径
      const absloutePath = transformPath(deps[key], parentPath);
      const name = getFileName(absloutePath);
      // path为相对父级路径，relativePath为相对根目录路径
      const relativePath = path.relative(__dirname, absloutePath);
      depsTree[name] = {
        relativePath,
        path: deps[key],
        deps: getVueDepsTree(
          path.resolve(path.dirname(filePath), deps[key]),
          relativePath
        ),
      };
    }
  }
  return depsTree;
};

// 将depsTree扁平化为对象，储存路径名和依赖，解决名称冲突问题
function flattenDepsTree(depsTree, parentName = "") {
  const result = {};
  const relativePathDict = {};
  function flatten(depsTree, parentName = "") {
    for (const key in depsTree) {
      let name = key;
      if (!(depsTree[key].relativePath in relativePathDict)) {
        if (key in result) {
          let addNumber = 1;
          name = addNumberToFileName(name, addNumber);
          while (name in result) {
            addNumber++;
            name = addNumberToFileName(name, addNumber);
          }
        }
        relativePathDict[depsTree[key].relativePath] = name;
        result[name] = true;

        // 在当前目录下的temp文件夹创建文件，名为name变量，文件值为文件路径对应的内容
        fs.writeFileSync(
          path.resolve(__dirname, directoryPath, name),
          fs.readFileSync(path.resolve(__dirname, depsTree[key].relativePath))
        );
      } else {
        name = relativePathDict[depsTree[key].relativePath];
      }
      // 如果文件名已存在，添加数字

      // 将对应父文件的import路径的文件名改为name名
      if (parentName) {
        isVueOrJs(depsTree[key].relativePath) &&
          replaceVueDeps(
            path.resolve(__dirname, directoryPath, parentName),
            depsTree[key].path,
            name
          );
        isCss(depsTree[key].relativePath) &&
          replaceCssDeps(
            path.resolve(__dirname, directoryPath, parentName),
            depsTree[key].path,
            name
          );
      }

      // 如果当前文件有依赖，递归调用flatten
      if (Object.keys(depsTree[key].deps).length) {
        flatten(depsTree[key].deps, name);
      }
    }
  }
  flatten(depsTree, parentName);
  return {
    relativePathDict,
    result,
  };
}

function writeFlatFiles(directoryPath, depsTree) {
  // 在当前目录创建一个temp文件夹，如果存在就删除原来文件夹
  if (fs.existsSync(path.resolve(__dirname, directoryPath))) {
    fs.rmSync(path.resolve(__dirname, directoryPath), { recursive: true });
  }
  fs.mkdirSync(path.resolve(__dirname, directoryPath));

  flattenDepsTree(depsTree);
}

module.exports = {
  getVueDepsTree,
  flattenDepsTree,
  writeFlatFiles,
};
