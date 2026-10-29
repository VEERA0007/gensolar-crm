// Checks the website build against an in-memory stand-in for Firebase.
// Run from the repository root after: node web/build-web.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const root = resolve('web/dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://127.0.0.1').pathname;
    const file = resolve(root, '.' + (p === '/' ? '/index.html' : p));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(r => server.listen(4180, '127.0.0.1', r));

const MOCK = `
(function(){
  var store=JSON.parse(localStorage.getItem('mockdb')||'null')||{
    users:{U1:{uid:'U1',phone:'+919876543210',role:'manager',organizationId:'genesis',displayName:'Veera',requestedRole:'sales_manager'}},
    invites:{},leads:{L1:{id:'L1',name:'Test lead',organizationId:'genesis',ownerUid:'x',status:'new'}}};
  function save(){localStorage.setItem('mockdb',JSON.stringify(store))}
  function snap(col,id){var d=store[col][id];return {id:id,exists:d!==undefined,data:function(){return d},ref:{delete:function(){delete store[col][id];save();return Promise.resolve()}}}}
  function docRef(col,id){return {get:function(){return Promise.resolve(snap(col,id))},
    set:function(v,o){store[col][id]=Object.assign(o&&o.merge?(store[col][id]||{}):{},v);save();return Promise.resolve()},
    update:function(v){store[col][id]=Object.assign(store[col][id]||{},v);save();return Promise.resolve()},
    delete:function(){delete store[col][id];save();return Promise.resolve()}}}
  function query(col,f){return {where:function(k,op,v){return query(col,f.concat([[k,op,v]]))},get:function(){
    var ids=Object.keys(store[col]).filter(function(id){return f.every(function(c){var x=store[col][id][c[0]];return c[1]==='in'?c[2].indexOf(x)>-1:x===c[2]})});
    return Promise.resolve({docs:ids.map(function(id){return snap(col,id)})})}}}
  var user=null;try{user=JSON.parse(localStorage.getItem('mockuser')||'null')}catch(e){}
  var authObj={get currentUser(){return user},setPersistence:function(){},
    onAuthStateChanged:function(cb){setTimeout(function(){cb(user)},0)},
    signInWithPhoneNumber:function(phone){return Promise.resolve({confirm:function(code){
      if(code!=='123456')return Promise.reject(new Error('The SMS code is invalid.'));
      user={uid:'U1',phoneNumber:phone};localStorage.setItem('mockuser',JSON.stringify(user));return Promise.resolve({user:user})}})},
    signOut:function(){user=null;localStorage.removeItem('mockuser');return Promise.resolve()}};
  var fb={initializeApp:function(){},auth:function(){return authObj},
    firestore:function(){return {collection:function(c){var q=query(c,[]);q.doc=function(id){return docRef(c,id)};return q}}}};
  fb.auth.Auth={Persistence:{LOCAL:'local'}};
  fb.auth.RecaptchaVerifier=function(){this.clear=function(){}};
  window.firebase=fb;
})();`;

const browser = await chromium.launch({ headless: true });
const failures = [];
const check = (c, m) => { if (!c) failures.push(m); else console.log('PASS:', m); };
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.stack || e.message));
  await page.route('https://www.gstatic.com/firebasejs/**', r => r.fulfill({ contentType: 'text/javascript', body: r.request().url().includes('app-compat') ? MOCK : '' }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto('http://127.0.0.1:4180/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  check(await page.evaluate(() => !!(window.GenSolarAuth && window.GenSolarLeads && window.GenSolarAdmin && window.GenSolarNative)), 'Web shim provides all four native bridges');
  await page.click('#openLogin');
  await page.fill('#loginPhone', '9876543210');
  await page.click('#sendOtpButton');
  await page.waitForTimeout(300);
  check(await page.locator('#otpFields').isVisible(), 'Sending the OTP shows the code field');
  await page.fill('#loginOtp', '000000');
  await page.evaluate(() => window.verifyRealOtp());
  await page.waitForTimeout(300);
  check((await page.locator('#authMessage').innerText()).includes('invalid'), 'A wrong code shows the error message');
  await page.fill('#loginOtp', '123456');
  await page.evaluate(() => window.verifyRealOtp());
  await page.waitForTimeout(600);
  check(await page.locator('#app').isVisible(), 'Correct code signs in and opens the app');
  check((await page.locator('#tabEng').innerText()).trim() === 'EPC' && await page.locator('#tabEng').isVisible(), 'Manager account sees the EPC tab');
  await page.click('#tabLeads');
  await page.waitForTimeout(400);
  check((await page.locator('#view-leads').innerText()).includes('Test lead'), 'Cloud leads load for the manager organization');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  check(await page.locator('#app').isVisible(), 'Session is restored after reloading the page');
  await page.click('#tabEng');
  await page.waitForTimeout(300);
  check(await page.locator('#epcRoot').isVisible(), 'EPC tab opens on the website');
  check(errors.length === 0, 'No uncaught JavaScript errors: ' + (errors.join(' | ') || 'none'));
} finally { await browser.close(); server.close(); }
if (failures.length) { console.error('FAILED:\n' + failures.join('\n')); process.exit(1); }
console.log('All web shim checks passed.');
