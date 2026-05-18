const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const platform = args[0] || 'current';
const type = args[1] || 'all';

const packageJson = require('../package.json');
const version = packageJson.version;

function runCommand(command, description) {
  console.log(`\n${description}...`);
  try {
    execSync(command, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`✓ ${description} completed`);
  } catch (error) {
    console.error(`✗ ${description} failed`);
    throw error;
  }
}

function buildRenderer() {
  runCommand('npm run build', 'Building renderer');
}

function buildElectron() {
  const config = {
    'current': 'electron-builder',
    'win': 'electron-builder --win',
    'mac': 'electron-builder --mac',
    'linux': 'electron-builder --linux',
    'all': 'electron-builder -mwl'
  };

  let command = config[platform] || config['current'];
  
  if (type === 'installer') {
    if (platform === 'win' || platform === 'current') {
      command += ' nsis';
    } else if (platform === 'mac') {
      command += ' dmg';
    } else if (platform === 'linux') {
      command += ' deb rpm';
    }
  } else if (type === 'portable') {
    if (platform === 'win' || platform === 'current') {
      command += ' portable';
    } else if (platform === 'mac') {
      command += ' zip';
    } else if (platform === 'linux') {
      command += ' AppImage';
    }
  } else if (type === 'all') {
    if (platform === 'win' || platform === 'current') {
      command += ' nsis portable';
    } else if (platform === 'mac') {
      command += ' dmg zip';
    } else if (platform === 'linux') {
      command += ' AppImage deb rpm';
    }
  }

  command += ' --publish never';
  
  runCommand(command, `Packaging for ${platform} (${type})`);
}

function clean() {
  const distPath = path.join(process.cwd(), 'dist');
  const releasePath = path.join(process.cwd(), 'release');
  
  [distPath, releasePath].forEach(dir => {
    if (fs.existsSync(dir)) {
      console.log(`Cleaning ${dir}...`);
      fs.rmSync(dir, { recursive: true });
    }
  });
}

function main() {
  console.log('='.repeat(50));
  console.log(`npmDesktopManager Build Script`);
  console.log(`Version: ${version}`);
  console.log(`Platform: ${platform}`);
  console.log(`Type: ${type}`);
  console.log('='.repeat(50));
  
  const validPlatforms = ['current', 'win', 'mac', 'linux', 'all'];
  const validTypes = ['all', 'installer', 'portable'];
  
  if (!validPlatforms.includes(platform)) {
    console.error(`Invalid platform: ${platform}`);
    console.log(`Valid platforms: ${validPlatforms.join(', ')}`);
    process.exit(1);
  }
  
  if (!validTypes.includes(type)) {
    console.error(`Invalid type: ${type}`);
    console.log(`Valid types: ${validTypes.join(', ')}`);
    process.exit(1);
  }
  
  clean();
  buildRenderer();
  buildElectron();
  
  console.log('\n' + '='.repeat(50));
  console.log('Build completed successfully!');
  console.log('Check the "release" directory for output.');
  console.log('='.repeat(50));
}

main();
