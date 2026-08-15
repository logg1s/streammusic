// Metro trong monorepo: app nằm ở `mobile/` nhưng `@vong/shared` nằm ở gốc repo và npm
// hoist phần lớn `node_modules` lên đó. Không khai hai chỗ này thì Metro không thấy file
// của shared (không watch) và nhìn thấy hai bản React (mỗi workspace một bản).
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// `@vong/shared` là TS thuần, không build sẵn — Metro transpile trực tiếp file nguồn.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
