const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const packageJson = require('../package.json');
const version = packageJson.version;

function runCommand(command, description) {
  console.log(`\n${description}...`);
  try {
    execSync(command, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`✓ ${description} completed`);
    return true;
  } catch (error) {
    console.error(`✗ ${description} failed`);
    return false;
  }
}

function getPlatformName() {
  switch (process.platform) {
    case 'win32': return 'win';
    case 'darwin': return 'mac';
    case 'linux': return 'linux';
    default: return 'unknown';
  }
}

function buildForCurrentPlatform() {
  const platform = getPlatformName();
  console.log(`Building for current platform: ${platform}`);
  
  runCommand('npm run build', 'Building application');
  
  const commands = {
    'win': [
      { cmd: 'electron-builder --win --config.win.target=nsis --publish never', desc: 'Building Windows installer' },
      { cmd: 'electron-builder --win --config.win.target=portable --publish never', desc: 'Building Windows portable' }
    ],
    'mac': [
      { cmd: 'electron-builder --mac --config.mac.target=dmg --publish never', desc: 'Building macOS DMG' },
      { cmd: 'electron-builder --mac --config.mac.target=zip --publish never', desc: 'Building macOS ZIP' }
    ],
    'linux': [
      { cmd: 'electron-builder --linux --config.linux.target=AppImage --publish never', desc: 'Building Linux AppImage' },
      { cmd: 'electron-builder --linux --config.linux.target=deb --publish never', desc: 'Building Linux DEB' }
    ]
  };
  
  const platformCommands = commands[platform];
  if (!platformCommands) {
    console.error('Unsupported platform');
    return false;
  }
  
  let success = true;
  platformCommands.forEach(({ cmd, desc }) => {
    if (!runCommand(cmd, desc)) {
      success = false;
    }
  });
  
  return success;
}

function buildForAllPlatforms() {
  console.log('Building for all platforms...');
  
  if (!buildForCurrentPlatform()) {
    return false;
  }
  
  const platforms = ['win', 'mac', 'linux'].filter(p => p !== getPlatformName());
  
  console.log('\nNote: Cross-platform builds may require additional setup:');
  console.log('- Windows builds on macOS/Linux: requires Wine');
  console.log('- macOS builds on Windows/Linux: not supported by Apple');
  console.log('- Linux builds on Windows: requires Docker or WSL');
  
  return true;
}

function createReleaseNotes() {
  const releaseDir = path.join(process.cwd(), 'release');
  if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir, { recursive: true });
  }
  
  const releaseNotes = `# Release v${version}

## Changes
- See CHANGELOG.md for details

## Downloads

### Windows
- \`npmDesktopManager Setup ${version}.exe\` - Installer
- \`npmDesktopManager ${version}.exe\` - Portable

### macOS
- \`npmDesktopManager-${version}.dmg\` - DMG Installer
- \`npmDesktopManager-${version}-mac.zip\` - ZIP Archive

### Linux
- \`npmDesktopManager-${version}.AppImage\` - AppImage (Portable)
- \`npmDesktopManager-${version}.deb\` - Debian Package
- \`npmDesktopManager-${version}.rpm\` - RPM Package

## System Requirements

### Windows
- Windows 7 or later
- 64-bit system

### macOS
- macOS 10.13 (High Sierra) or later
- Intel or Apple Silicon processor

### Linux
- glibc 2.17 or later
- 64-bit system
`;
  
  const notesPath = path.join(releaseDir, `RELEASE_NOTES_v${version}.md`);
  fs.writeFileSync(notesPath, releaseNotes);
  console.log(`\n✓ Release notes created: ${notesPath}`);
}

function main() {
  console.log('='.repeat(50));
  console.log(`npmDesktopManager Release Script`);
  console.log(`Version: ${version}`);
  console.log('='.repeat(50));
  
  const args = process.argv.slice(2);
  const target = args[0] || 'current';
  
  let success;
  
  if (target === 'all') {
    success = buildForAllPlatforms();
  } else if (target === 'current') {
    success = buildForCurrentPlatform();
  } else {
    console.error(`Invalid target: ${target}`);
    console.log('Usage: node release.js [current|all]');
    process.exit(1);
  }
  
  if (success) {
    createReleaseNotes();
    
    console.log('\n' + '='.repeat(50));
    console.log('Release build completed successfully!');
    console.log('Check the "release" directory for output.');
    console.log('='.repeat(50));
  }
}

main();
