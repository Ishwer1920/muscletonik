# Muscle Tonik — Android App

A native Android application for the **Muscle Tonik** supplement store, built with
[Capacitor](https://capacitorjs.com/). It is a thin native shell that loads your
**existing, live website** (`https://muscletonik.com`) and reuses your existing
production backend and database through the same API the website already uses.

Nothing about your website, backend, database, domain, DNS, or VPS was changed to
build this app. All the app code lives inside this one folder: `mobile-app/`.

---

## 1. Architecture

```
┌──────────────────────── Android device ────────────────────────┐
│                                                                 │
│   Muscle Tonik.apk  (Capacitor native shell, com.muscletonik.app)│
│   ├─ Native splash screen (brand logo, #ff7a00 spinner)         │
│   ├─ Native status bar + hardware back button handling          │
│   ├─ Offline fallback page (www/offline.html, bundled locally)  │
│   └─ Android System WebView                                     │
│          │  loads server.url over HTTPS                         │
│          ▼                                                      │
│      https://muscletonik.com   ← your REAL website, live        │
│          │  (HTML/CSS/JS served by your Django app)             │
│          ▼  fetch(...) with cookies, same-site                  │
│      https://api.muscletonik.com/api/...  ← your REAL backend   │
│          ▼                                                      │
│      MongoDB (Atlas) on your Hostinger VPS ← your REAL database │
└─────────────────────────────────────────────────────────────────┘
```

**Why "live-load" and not a bundled copy of the site?**

Your auth uses **HttpOnly, `SameSite=Lax`, host-only cookies** (see
`server_django/apps/accounts/views.py` → `_cookie_kwargs`). Those cookies are only
sent to `api.muscletonik.com` when the page making the request is on a **same-site**
origin (a `*.muscletonik.com` origin). The production API's CORS also only allows the
`https://muscletonik.com` / `https://www.muscletonik.com` origins with credentials.

Loading the real site via `server.url` makes the WebView's origin literally
`https://muscletonik.com`, so **login, cart, wishlist, checkout, Razorpay, and order
history all work exactly as they do in a desktop browser** — no CORS changes, no
cookie-domain changes, no backend changes. It also means the app is always in sync
with the website (new products, banners, prices, admin changes appear instantly) with
**zero asset syncing**.

> The backend is **Django + MongoDB (mongoengine)**, not Node/Express. The original
> prompt assumed Node/Express; the actual code was inspected and is Django. No backend
> change was needed for this app regardless.

### Key facts

| Thing | Value |
|---|---|
| Framework | Capacitor 8 (Android) |
| App ID / package | `com.muscletonik.app` |
| App name | Muscle Tonik |
| versionName / versionCode | `1.0.0` / `1` |
| minSdk / target / compileSdk | 24 / 36 / 36 |
| Live site loaded | `https://muscletonik.com` |
| Live API | `https://api.muscletonik.com/api` |
| Permissions | `INTERNET` only |
| Cleartext HTTP | disabled (`usesCleartextTraffic=false`) |
| Backup of session data | disabled (`allowBackup=false`) |
| Payments | Razorpay web checkout + COD (unchanged, server-verified) |

---

## 2. Prerequisites (to build the APK on your machine)

The app project is fully configured in this repo. To compile it into an APK/AAB you
need the Android toolchain, which is **not** installed in the environment where this
project was generated — so the APK must be built on your own machine:

1. **Node.js 18+** — already used here (v24). Check: `node -v`
2. **JDK 21** (Temurin/Adoptium recommended). Android Gradle Plugin for compileSdk 36
   needs JDK 17+; 21 is the safe choice. Check: `java -version`
3. **Android Studio** (latest) — the simplest way to get the Android SDK, platform
   **API 36**, build-tools, and platform-tools (`adb`). Download:
   https://developer.android.com/studio
4. After installing Android Studio, open it once and let it install:
   - Android SDK Platform 36
   - Android SDK Build-Tools
   - Android SDK Platform-Tools (gives you `adb`)
5. Set environment variables (Windows, PowerShell, user scope):
   ```powershell
   setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
   setx JAVA_HOME "C:\Program Files\Eclipse Adoptium\jdk-21.x.x-hotspot"
   ```
   Open a new terminal afterward so the variables take effect.

---

## 3. One-time setup after cloning

```powershell
cd mobile-app
npm install          # restores Capacitor CLI + plugins
npx cap sync android # copies config + web assets into android/
```

---

## 4. Run the app (fastest path — Android Studio)

```powershell
cd mobile-app
npx cap open android
```

This opens the `android/` project in Android Studio. Plug in your phone (USB
debugging on) or start an emulator, then press **Run ▶**. The app installs and
launches, shows the brand splash, then loads the live store.

---

## 5. Build a debug APK (for your personal phone)

```powershell
cd mobile-app\android
.\gradlew.bat assembleDebug
```

The first run downloads Gradle + dependencies and can take several minutes.

**Output APK:**
```
mobile-app\android\app\build\outputs\apk\debug\app-debug.apk
```

The debug APK is signed with Android's auto-generated debug key — fine for installing
on your own device, **not** for the Play Store (use the AAB in section 9 for that).

---

## 6. Install the APK on your Android phone

**Option A — USB (adb):**
```powershell
# phone connected, USB debugging enabled
adb install -r mobile-app\android\app\build\outputs\apk\debug\app-debug.apk
```

**Option B — copy the file:**
1. Copy `app-debug.apk` to the phone (USB, Google Drive, email to yourself, etc.).
2. On the phone, tap the file.
3. Allow "Install unknown apps" for the app you opened it from (Files/Chrome) when
   prompted.
4. Install, then open **Muscle Tonik**.

---

## 7. Change the API / site URL (e.g. staging vs production)

Everything points at one place: `mobile-app/capacitor.config.json` →
`server.url` and `server.allowNavigation`.

Use the helper to switch and re-sync in one step:
```powershell
cd mobile-app
node scripts/switch-env.mjs prod     # https://muscletonik.com  (default)
node scripts/switch-env.mjs staging  # edit the URL inside the script first
```
Or edit `capacitor.config.json` by hand, then run `npx cap sync android`.

> Never set `server.url` to `http://localhost` / `127.0.0.1` for a release build —
> that only works while your dev machine is on the same network and breaks HTTPS-only
> + cookie rules.

---

## 8. "Synchronizing website assets" — not needed here

Because the app **loads the live site**, there are no copied HTML/CSS/JS assets to keep
in sync. Any change you publish to the website (`git pull && systemctl restart
muscletonik` on the VPS) appears in the app immediately on next launch. The only files
bundled into the app are the local **loading** and **offline** screens
(`mobile-app/www/`), which rarely change.

---

## 9. Build a signed release AAB (for Google Play)

Google Play requires an **Android App Bundle (.aab)** signed with *your own* private
release key.

### 9.1 Create your release keystore (once, keep it forever)
```powershell
keytool -genkeypair -v `
  -keystore mobile-app\android\muscle-tonik-release.jks `
  -alias muscletonik `
  -keyalg RSA -keysize 2048 -validity 10000
```
Answer the prompts and choose strong passwords.

> ⚠️ **Back up this `.jks` file and its passwords safely.** If you lose them you can
> never publish an update to the same app on Google Play. The keystore is git-ignored
> and must never be committed.

### 9.2 Point the build at your keystore
```powershell
copy mobile-app\android\keystore.properties.example mobile-app\android\keystore.properties
```
Edit `keystore.properties` with your real `storePassword`, `keyAlias`, `keyPassword`
(the `storeFile` already points at `muscle-tonik-release.jks`). This file is
git-ignored.

### 9.3 Build the bundle
```powershell
cd mobile-app\android
.\gradlew.bat bundleRelease
```

**Output AAB:**
```
mobile-app\android\app\build\outputs\bundle\release\app-release.aab
```

Upload that `.aab` in the Play Console. (You can keep Google Play App Signing enabled;
your upload key is the keystore above.)

---

## 10. Updating the app later

- **Content / products / prices / banners:** nothing to do — they come from the live
  site automatically.
- **App shell / native behavior / Capacitor version:** edit files in `mobile-app/`,
  bump `versionCode` (and `versionName`) in `android/app/build.gradle`, then rebuild
  (section 5 for APK, section 9 for AAB). `versionCode` **must increase** for every
  Play upload.

---

## 11. Google Play listing — data & permissions to declare

For the Play Console **Data safety** form and store listing:

- **Permissions requested:** `INTERNET` only. No location, contacts, camera,
  microphone, storage, or background permissions.
- **Data collected:** the app itself collects nothing new. Data entry (account,
  addresses, orders, payments) happens on your existing website through the WebView,
  governed by your existing privacy policy.
- **Third-party SDKs / services reached inside the WebView** (these are your
  website's, not added by the app): Razorpay (payments), Google Analytics / Tag
  Manager, Meta Pixel. Declare these as your site already does.
- **Privacy policy URL:** _placeholder — supply your real URL_, e.g.
  `https://muscletonik.com/privacy`. One was not invented here.
- **Account deletion:** Play requires a way for users to delete their account. Ensure
  your site exposes this (it is reachable through the app automatically).

---

## 12. Troubleshooting

**Build: `SDK location not found` / `Failed to find target with hash string
'android-36'`**
→ Install SDK Platform 36 in Android Studio ▸ SDK Manager, and set `ANDROID_HOME`.
Or create `mobile-app/android/local.properties` with `sdk.dir=C\:\\Users\\<you>\\AppData\\Local\\Android\\Sdk`.

**Build: `Unsupported class file major version` / JDK errors**
→ Use JDK 21 and set `JAVA_HOME`. In Android Studio: Settings ▸ Build Tools ▸ Gradle
▸ Gradle JDK = 21.

**Build: Android SDK license not accepted**
→ `%ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager.bat --licenses` and accept all.

**Install: "App not installed" / signature conflict**
→ Uninstall any previous Muscle Tonik build first: `adb uninstall com.muscletonik.app`.

**App opens to the offline screen even with internet**
→ Confirm the phone can reach `https://muscletonik.com` in its browser. Check the site
is up (`curl -I https://muscletonik.com`). The offline page has a **Try again** button.

**Login doesn't persist / cart empties**
→ This means cookies aren't flowing. It should work out of the box because the WebView
runs at the real `muscletonik.com` origin. If you changed `server.url` to a non
`muscletonik.com` host, the API's CORS + `SameSite=Lax` cookies will block auth — keep
`server.url` on `https://muscletonik.com`.

**Razorpay UPI opens another app and doesn't come back**
→ Card / netbanking 3-D Secure completes inside the WebView. Some UPI flows do an
app-switch; test on a real device. If a specific flow misbehaves, the fix is to add
Razorpay's native Android SDK — see "Limitations" below. COD checkout needs no
payment step and is a good end-to-end test.

---

## 13. What was created / changed

**Created (all inside `mobile-app/`):**
- `package.json`, `capacitor.config.json`, `.gitignore`, `README.md`
- `www/index.html` (loading shell), `www/offline.html` (offline fallback)
- `assets/logo.png` (icon source, copied from the site's `favicon-512x512.png`)
- `scripts/switch-env.mjs` (URL switcher)
- `android/` — the full native Android project (generated by Capacitor), plus:
  - hardened `AndroidManifest.xml` (`allowBackup=false`, `usesCleartextTraffic=false`,
    `data_extraction_rules`)
  - release signing wired in `app/build.gradle` (reads git-ignored
    `keystore.properties`)
  - generated launcher icons, adaptive icons, and splash screens (brand)

**Changed in the existing website / backend / database:** **nothing.**

---

## 14. Limitations / not yet verified

- **APK not compiled in the generating environment** — it had Node but no JDK/Android
  SDK/Gradle. The project is complete and ready; build it with sections 4–5 above.
- **Payments on-device not run** — Razorpay web checkout is wired (your site's existing
  integration, server-verified). Card/netbanking work in-WebView; UPI app-switch should
  be tested on a real device. No test orders were placed against the live store.
- **Requires a network connection** — by design (live-load). A branded offline screen is
  shown when there's no connection.
- **Play Store policy** — a store-wrapper app is generally accepted for a real
  e-commerce business like this, but Google may ask for justification. If ever needed,
  the alternative is bundling the assets locally; that requires handling the
  same-site-cookie constraint described in section 1.
