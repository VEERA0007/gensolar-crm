// Builds the GenSolar website from the Android app's own index.html.
// Run from the repository root: node web/build-web.mjs   (output: web/dist)
import { cpSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const app = 'gensolar-android-project/gensolar-android/app';
const assets = resolve(app, 'src/main/assets');
const out = resolve('web/dist');
const gradle = readFileSync(resolve(app, 'build.gradle'), 'utf8');
const version = (gradle.match(/versionName\s+'([^']+)'/) || [])[1] || '';
const SDK = '10.12.5';

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(assets, out, { recursive: true });
cpSync('web/firebase-config.js', resolve(out, 'firebase-config.js'));
cpSync('web/web-shim.js', resolve(out, 'web-shim.js'));

let html = readFileSync(resolve(out, 'index.html'), 'utf8');
const inject = [
  `<script>window.GENSOLAR_WEB_VERSION=${JSON.stringify(version)};</script>`,
  `<script src="https://www.gstatic.com/firebasejs/${SDK}/firebase-app-compat.js"></script>`,
  `<script src="https://www.gstatic.com/firebasejs/${SDK}/firebase-auth-compat.js"></script>`,
  `<script src="https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore-compat.js"></script>`,
  `<script src="firebase-config.js"></script>`,
  `<script src="web-shim.js"></script>`,
].join('\n');
if (!html.includes('</body>')) throw new Error('index.html has no </body>');
html = html.replace('</body>', inject + '\n</body>');
// The Android-only "Update available" bar points at the APK. The website always serves the latest build.
html = html.replace('<title>GenSolar Pro</title>', '<title>GenSolar Pro</title>\n<link rel="icon" href="gensolar_app_icon.png">');
writeFileSync(resolve(out, 'index.html'), html);
writeFileSync(resolve(out, '.nojekyll'), '');
console.log(`Built web/dist for version ${version}`);
