const fs = require('fs');
const path = require('path');

const retainedLocales = new Set(['en-US.pak', 'zh-CN.pak']);
const removableRuntimeFiles = [
  'dxcompiler.dll',
  'dxil.dll',
  'vulkan-1.dll',
  'vk_swiftshader.dll',
  'vk_swiftshader_icd.json'
];

exports.default = async function afterPack(context) {
  pruneLocales(path.join(context.appOutDir, 'locales'));
  pruneRuntimeFiles(context.appOutDir);
};

function pruneLocales(localesDir) {
  if (!fs.existsSync(localesDir)) return;

  let removed = 0;
  for (const entry of fs.readdirSync(localesDir, { withFileTypes: true })) {
    if (!entry.isFile() || retainedLocales.has(entry.name)) continue;
    fs.rmSync(path.join(localesDir, entry.name), { force: true });
    removed += 1;
  }

  if (removed > 0) {
    console.log(`Pruned ${removed} unused Electron locale files`);
  }
}

function pruneRuntimeFiles(appOutDir) {
  let removed = 0;
  for (const fileName of removableRuntimeFiles) {
    const filePath = path.join(appOutDir, fileName);
    if (!fs.existsSync(filePath)) continue;
    fs.rmSync(filePath, { force: true });
    removed += 1;
  }

  if (removed > 0) {
    console.log(`Pruned ${removed} optional Electron GPU runtime files`);
  }
}
