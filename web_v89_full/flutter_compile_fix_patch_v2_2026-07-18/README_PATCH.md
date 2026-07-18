# Flutter compile fix V2

This patch changes only one expression in `lib/main.dart`:

```dart
_aboutMeTab(me),
```

to:

```dart
_aboutMeTab(me!),
```

The V2 installer contains ASCII characters only, so Windows PowerShell 5.1 will not misread UTF-8 Vietnamese text.

## Install

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install_patch.ps1 -ProjectPath "D:\bank\meetmobile\flutter_application_1"
```

Or:

```cmd
install_patch.cmd "D:\bank\meetmobile\flutter_application_1"
```

Then run:

```powershell
cd "D:\bank\meetmobile\flutter_application_1"
flutter clean
flutter pub get
flutter run --release
```
