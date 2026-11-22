// scripts/build-apk.mjs — ATMOS-VIGIL local .APK builder.
//
// This is the offline-friendly equivalent of the GitHub Actions pipeline
// (.github/workflows/build-and-bundle-apk.yml). The CI pipeline is the source of
// truth for the one-tap download in the app; this script builds locally with
// your own JDK + Android SDK + Gradle:
//
//   npm run build          # SvelteKit production bundle → build/
//   npm ci                 # ensure deps
//   npm run apk:build      # capacitor sync + gradle assemble
//
// Requirements:
//   * Java JDK 17+ and Android SDK (ANDROID_HOME or ANDROID_SDK_ROOT exported)
//   * Gradle ≥ 8 (or the bundled gradlew)
//   * APK signing material is NOT required for a debug build.
//
// Output: android/app/build/outputs/apk/debug/app-debug.apk
// Staged to: static/releases/atmosvigil-debug.apk

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();

function log(msg) { console.log(`[build:apk] ${msg}`); }

function run(cmd, opts = {}) {
  log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
}

function checkTool(name) {
  try {
    execSync(`${name} --version`, { stdio: 'ignore', cwd: root });
    return true;
  } catch {
    return false;
  }
}

function main() {
  log('matrix build (offline-friendly local APK builder)');

  // 1. production web build
  log('step 1/6: production web bundle (0% TypeScript)');
  run('npm run build');

  // 2. verify webDir exists
  const webDir = path.join(root, 'build');
  if (!fs.existsSync(webDir)) {
    throw new Error(`webDir ${webDir} missing — run npm run build first`);
  }
  log(`webDir verified: ${webDir}`);

  // 3. Capacitor project generation (skip if android/ already exists)
  const androidDir = path.join(root, 'android');
  const pluginSourceDir = path.join(root, 'android.plugins-src');
  if (!fs.existsSync(androidDir) || !fs.existsSync(path.join(androidDir, 'app'))) {
    // Move checked-in plugin sources aside before generating the native project
    if (fs.existsSync(androidDir) && !fs.existsSync(pluginSourceDir)) {
      fs.renameSync(androidDir, pluginSourceDir);
      log('step 2/6: moved checked-in plugins aside; generating Capacitor project…');
    }
    if (!fs.existsSync(androidDir)) {
      run('npx cap add android');
    }
  } else {
    log('step 2/6: android/ already present — skipping cap add');
  }

  // 4. inject checked-in plugin sources + MainActivity registration
  const pluginDir = path.join(androidDir, 'app/src/main/java/com/atmosvigil/meteo');
  fs.mkdirSync(pluginDir, { recursive: true });
  if (fs.existsSync(pluginSourceDir)) {
    const srcPlugins = path.join(pluginSourceDir, 'app/src/main/java/com/atmosvigil/meteo');
    const srcMain = path.join(pluginSourceDir, 'capacitor/MainActivity.kt');
    if (fs.existsSync(srcPlugins)) {
      for (const f of fs.readdirSync(srcPlugins)) {
        fs.copyFileSync(path.join(srcPlugins, f), path.join(pluginDir, f));
      }
    }
    if (fs.existsSync(srcMain)) {
      fs.copyFileSync(srcMain, path.join(pluginDir, 'MainActivity.kt'));
    }
    fs.rmSync(pluginSourceDir, { recursive: true, force: true });
  } else {
    const checkedIn = path.join(androidDir, 'app/src/main/java/com/atmosvigil/meteo');
    if (fs.existsSync(checkedIn)) {
      for (const f of fs.readdirSync(checkedIn)) {
        fs.copyFileSync(path.join(checkedIn, f), path.join(pluginDir, f));
      }
    }
  }
  fs.rmSync(path.join(pluginDir, 'MainActivity.java'), { force: true });
  log('step 3/6: plugin sources injected');

  // 5. Capacitor sync — copies build/ → android/app/src/main/assets/public
  log('step 4/6: npx cap sync android');
  run('npx cap sync android');

  // 6. Gradle assemble
  log('step 5/6: gradle :app:assembleDebug');
  if (checkTool('gradle')) {
    run('gradle :app:assembleDebug');
  } else if (fs.existsSync(path.join(androidDir, 'gradlew'))) {
    run('./gradlew :app:assembleDebug', { cwd: androidDir });
  } else {
    throw new Error('Gradle not found. Install Gradle 8+ (or run ./gradlew inside android/) and re-run.');
  }

  // 7. stage APK
  log('step 6/6: stage APK into static/releases/');
  try {
    const out = execSync(
      'find android -name "*.apk" -path "*outputs*" | grep -i debug | head -n 1',
      { encoding: 'utf8', cwd: root }
    ).trim();
    if (!out) throw new Error('no APK produced');
    const staged = path.join(root, 'static/releases/atmosvigil-debug.apk');
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    fs.copyFileSync(out, staged);
    log(`staged → ${path.relative(root, staged)}`);
    log('DONE — debug APK built. For a release APK, add signing material and ' +
        'use gradle :app:assembleRelease (CI pipeline does this on main).');
  } catch (err) {
    console.error('[build:apk] stage failed:', err.message);
    process.exitCode = 1;
  }
}

main();
