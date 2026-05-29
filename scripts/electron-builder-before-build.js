exports.default = async function beforeBuild() {
  // Vite bundles the renderer and Electron entry files, so the packaged app
  // does not need electron-builder to copy production node_modules.
  return false;
};
