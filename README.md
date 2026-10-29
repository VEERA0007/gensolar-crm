# GenSolar Pro

GenSolar Solar Calculator Android app.

## What is in version 1.3
- New welcome screen with the Gensolar logo, Login and Explore GenSolar.
- Login with mobile number and SMS OTP (Firebase). The role (Customer, Representative, Manager) comes from the account, never from a screen choice.
- Explore GenSolar opens the calculator without signing in.
- Solar estimator with slab-wise electricity tariffs for Telangana, Andhra Pradesh, Odisha and Chhattisgarh (FY 2026-27), per-state sunlight defaults, and commercial and industrial energy rates.
- New yellow bolt app icon.
- A fixed debug signing key (`app/debug.keystore`) so every build has the same fingerprints for Firebase.

## Firebase fingerprints (add once)
Firebase Console, Project settings, your Android app `com.gensolar.pro`, Add fingerprint. Add both:

- SHA-1: `AA:C3:A2:09:8C:14:EC:CC:48:E5:7F:34:14:C3:6E:D4:6C:2A:F9:40`
- SHA-256: `4F:A8:E2:FD:3F:4D:1D:41:BE:E8:25:97:5A:B1:F1:CD:B9:15:A5:12:84:B0:C6:F5:91:40:E5:FC:2A:A6:A7:88`

Also check that Authentication, Sign-in method, Phone is turned on and that Firestore is created.

## Build the APK
Actions tab, Build GenSolar APK, Run workflow. When it finishes, download `GenSolar-Pro-debug-APK` from the run.

More notes are in `gensolar-android-project/gensolar-android/README.txt` and `LEAD_CRM_SETUP.md`.

## Version 1.3 changes
- Splash screen with the app icon before the welcome screen.
- Explore GenSolar opens the company website in the phone's browser. To change the address, edit `GENSOLAR_WEBSITE` near the top of the script section in `app/src/main/assets/index.html`.
- OTP sign-in no longer crashes silently: errors are caught and shown, and if the app ever closes unexpectedly, the next start shows the error text.
- The app now keeps its state when the OTP security check opens the browser and returns.

## Version 1.4 changes
- The five-step calculator is replaced by the Gensolar estimator screen (segment switch, state tariffs, cash chart), with the same look on every screen.
- Back button in the header and on the phone's back key.
- Tabs: Estimator, Leads (My estimates for customers) and Profile.
- Profile now saves name, email, mobile and a photo (the photo picker is handled by the app).
- Leads: add contacts, change status, add follow-up notes, share a CSV. Customers can save and share estimates.
- Share quote and Save as PDF use the phone's share menu and print service.
- Signed-in users stay signed in; the Login button changes to Continue.

## v1.5 (merged)

This version merges the earlier v1.4 app with the extra work from the reference `GenSolar-main` repository:

- Engineering & Site Design workspace (new bottom tab)
- Cloud lead sync through Firestore (`firestore.rules` — publish these rules in the Firebase console before using real data)
- Login-required popup on the welcome feature cards
- Explore GenSolar opens https://gensolar.in/
- New GENSOLAR welcome logo; original welcome design kept
- Releases page: every successful build publishes `GenSolar-Pro-v1.5.apk` under **Releases → latest**
- Browser smoke tests: `tests/gensolar-webview-smoke.mjs`

## v1.7

- UI redesigned to the new mockup: welcome screen, "Login to GenSolar" page and "Select Your Role" page.
- Role selection stores a *requested* role (`requestedRole` in `users/{uid}`). Access stays Customer until an administrator sets `role` (and `organizationId`) in the Firebase console.
- Built-in update check: the app reads the latest GitHub Release and shows an "Update available" bar with a download button. To ship an update: bump `versionName`/`versionCode` in `app/build.gradle` and push to `main`; the workflow publishes `GenSolar-Pro-vX.Y.apk`, and installed apps offer it on next launch. Updates install over the old app because the signing key is fixed.
- Not included yet: Google sign-in and email / Employee ID login (need Firebase Google provider + a backend for employee IDs).

## v1.8 — Team approvals

Managers and admins get a **Team** tab listing role requests. Approve gives `rep` (Sales Representative, Channel Partner) or `manager` (Sales Head, Regional Manager, Sales Manager); only an `admin` can approve manager requests. The `admin` role itself is set only in the Firebase console. First-time setup: on your own `users/{uid}` document set `role` = `admin` and `organizationId` = e.g. `genesis`. Publish the updated `firestore.rules`.

## v1.9

- Profile photo: tap the round photo on the Profile page (pencil badge) to change it.
- Team tab is admin-only: add members by name, mobile number and role; they receive the role automatically on first sign-in (stored in `invites/{+91number}`, deleted after use). Also lists members, waiting invites and role requests.
- Publish the updated `firestore.rules` (new `invites` collection; role requests and member lists are admin-only).

## Version 1.4: CRM and manager dashboard
- New Dashboard tab, visible only to Manager and Admin accounts: sales target progress (default ₹1 crore, editable), open pipeline, win rate, pipeline by stage, follow-ups due, team, dealer and lead-source performance.
- Dealer commission: default rate, per-dealer rate, commission earned on Won leads, amount paid and balance due, with a shareable statement (saved on the phone).
- Leads now carry an optional dealer and a next follow-up date. These sync to the cloud with each lead.
- Access is enforced by the existing Firestore rules: representatives only load leads assigned to them, so the figures a manager sees come from the whole organization and a representative's never do.
- The sales target is saved on the phone only.

## v1.9.5: EPC tab

The manager **Engineering** tab is now **EPC** (Engineering, Procurement, Construction). It keeps everything that was in Engineering and adds the rest of the project cycle.

- **Engineering:** Site (the previous site, resource and pre-sales checklist), Layout (module, array blocks, tilt, spacing, foundation, pipe sections, walkway), Drawings (3D view, side elevation, plan with foundation marking), Electrical (string length, strings per MPPT, DC and AC cable and breaker sizing), BOM (cut list and materials) and Documents.
- **Procurement:** purchase list from the design with rate, vendor and status per item, GST, total and cost per Wp, vendor list, and copyable RFQ text.
- **Construction:** 11-step schedule with suggested durations from the design, timeline chart, progress, site checklist and notes.
- Save, reopen and start new EPC projects with the buttons at the top of the tab. Data is stored on the device (`gs_epc_v1`, `gs_epc_projects_v1`); there is no cloud sync.
- Rates, module data, inverter data and pipe sections are example values. Replace them before quoting. Output is preliminary and needs engineer sign-off.

## Web app

The same app runs in a browser. `web/build-web.mjs` copies the Android app's `index.html` and assets into `web/dist` and adds `web/web-shim.js`, which provides the same sign-in, leads, team and share features through the Firebase web SDK (same Firebase project, same `firestore.rules`). The **Deploy GenSolar Web** workflow publishes it to GitHub Pages on every push to `main`.

One-time setup:
1. GitHub: Settings, Pages, Build and deployment, Source: **GitHub Actions**.
2. Firebase console: Authentication, Settings, Authorized domains, add `veera0007.github.io`.
3. If phone sign-in on the website reports an API key or app error, add a Web app in Firebase (Project settings, Your apps) and paste its `apiKey` and `appId` into `web/firebase-config.js`.

The website is at `https://veera0007.github.io/gensolar-crm/`. To test locally: `node web/build-web.mjs`, then serve `web/dist` and open it. `node tests/web-shim-smoke.mjs` checks the website build against an in-memory stand-in for Firebase.
