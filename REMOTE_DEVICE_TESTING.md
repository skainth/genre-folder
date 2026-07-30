# Remote Android Device Testing

This project is wired for remote Android device testing using EAS builds plus:
- BrowserStack App Automate/App Live
- Firebase Test Lab (real/virtual Android fleet)

## 1) Prerequisites
- Node.js and npm installed
- Expo account
- EAS CLI installed: `npm install -g eas-cli`
- BrowserStack account with API credentials
- Google Cloud CLI (`gcloud`) installed for Firebase Test Lab
- Google Cloud project with Firebase Test Lab enabled

## 2) Build APK for testing
From project root:

```powershell
npm run build:android:preview
```

This creates a cloud Android APK build through EAS (`preview` profile in `eas.json`).

Optional local build (requires Android toolchain installed):

```powershell
npm run build:android:preview:local
```

## 3) Download the APK
- After EAS build completes, download the APK to your machine.
- Example local path: `C:\temp\mp3-sorter-preview.apk`

## 4) BrowserStack path
### 4.1 Upload APK to BrowserStack
Set credentials and app path, then run upload:

```powershell
$env:BROWSERSTACK_USERNAME = "your_username"
$env:BROWSERSTACK_ACCESS_KEY = "your_access_key"
$env:APP_PATH = "C:\temp\mp3-sorter-preview.apk"
npm run upload:browserstack
```

The script prints `app_url` on success.

### 4.2 Start BrowserStack testing
- Open BrowserStack App Live or App Automate dashboard.
- Use the uploaded app (`app_url`) to launch on real Android devices.
- Validate screen layouts for home and processing flows across device sizes.

## 5) Firebase Test Lab path
### 5.1 Authenticate gcloud

```powershell
gcloud auth login
```

### 5.2 Set required variables and run robo test

```powershell
$env:APP_PATH = "C:\temp\mp3-sorter-preview.apk"
$env:FIREBASE_PROJECT = "your-gcp-project-id"

# Optional overrides:
# $env:FTL_DEVICE_MODEL = "oriole"
# $env:FTL_ANDROID_VERSION = "34"
# $env:FTL_LOCALE = "en"
# $env:FTL_ORIENTATION = "portrait"

npm run run:firebase:testlab
```

The script runs:
- `gcloud firebase test android run --type robo --app <apk> ...`

Use the Firebase Test Lab results dashboard to inspect screenshots, crawler navigation, and failures.

## Notes
- Keep credentials in environment variables; do not hardcode secrets.
- BrowserStack and Firebase Test Lab both use the same APK produced by EAS.
- If needed, you can extend this setup for LambdaTest or Sauce Labs similarly.
