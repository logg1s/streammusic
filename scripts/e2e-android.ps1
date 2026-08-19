param(
  [Parameter(Mandatory)] [string] $Artifacts,
  [Parameter(Mandatory)] [string] $StateFile
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$repo = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $repo "mobile"
$sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$adb = Join-Path $sdk "platform-tools\adb.exe"
$emulator = Join-Path $sdk "emulator\emulator.exe"
$avd = "Medium_Phone_API_36.0"
$package = "app.vong.mobile"
$startedEmulator = $false

function Adb { & $adb @args; if ($LASTEXITCODE -ne 0) { throw "adb thất bại: $($args -join ' ')" } }

function Wait-Until {
  param([Parameter(Mandatory)] [scriptblock] $Condition, [string] $Description, [int] $TimeoutSec = 90)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    try { if (& $Condition) { return } } catch { }
    Start-Sleep -Milliseconds 700
  } while ((Get-Date) -lt $deadline)
  throw "Hết thời gian chờ $Description"
}

function Get-UiXml {
  & $adb shell rm -f /sdcard/vong-window.xml *> $null
  & $adb shell uiautomator dump /sdcard/vong-window.xml *> $null
  if ($LASTEXITCODE -ne 0) { throw "uiautomator không tạo được UI dump mới" }
  $raw = (& $adb exec-out cat /sdcard/vong-window.xml | Out-String)
  return [xml]$raw
}

function Find-Node {
  param([Parameter(Mandatory)] [string] $Pattern, [string] $Class = "")
  $xml = Get-UiXml
  $nodes = $xml.SelectNodes("//node") | Where-Object {
    ($Class.Length -eq 0 -or $_.class -eq $Class) -and
    (($_.text -match $Pattern) -or ($_."content-desc" -match $Pattern))
  }
  return $nodes | Sort-Object -Property @(
    @{ Expression = { if ($_.clickable -eq "true") { 0 } else { 1 } } },
    @{ Expression = { if ($_.text -eq $Pattern -or $_."content-desc" -eq $Pattern) { 0 } else { 1 } } }
  ) | Select-Object -First 1
}

function Get-MediaSession {
  return (& $adb shell dumpsys media_session | Out-String)
}

function Wait-MediaPlaying {
  param([int] $ActiveItem, [int] $TimeoutSec = 30)
  Wait-Until -Description "MediaSession đang phát" -TimeoutSec $TimeoutSec -Condition {
    $media = Get-MediaSession
    return $media -match 'state=(?:PLAYING\()?3\)?' -and
      $media -match "active item id=$ActiveItem"
  }
}

function Wait-MediaNextTransition {
  param([int] $TimeoutSec = 30)
  Wait-Until -Description "MediaSession chuyển sang bài kế" -TimeoutSec $TimeoutSec -Condition {
    $events = (& $adb logcat -d -s "MediaSessionService:D" "*:S" | Out-String)
    return $events -match 'state=(?:PLAYING\()?3\)?' -and
      $events -match 'active item id=1'
  }
}

function Wait-MediaPaused {
  param([int] $TimeoutSec = 30)
  Wait-Until -Description "MediaSession tạm dừng" -TimeoutSec $TimeoutSec -Condition {
    (Get-MediaSession) -match 'state=(?:PAUSED\()?2\)?'
  }
}

function Wait-Node {
  param([Parameter(Mandatory)] [string] $Pattern, [int] $TimeoutSec = 90)
  $found = $null
  Wait-Until -Description "UI /$Pattern/" -TimeoutSec $TimeoutSec -Condition {
    $script:found = Find-Node $Pattern
    if ($null -eq $script:found) {
      $focus = (& $adb shell dumpsys activity activities | Select-String -Pattern "topResumedActivity" | Out-String)
      if ($focus -notmatch [regex]::Escape($package)) {
        # Google Play có thể cập nhật Android System WebView giữa lượt chạy. Android
        # chủ động giết mọi app đang dùng WebView; mở lại Vọng và tiếp tục từ state đã
        # lưu thay vì báo nhầm thành crash sản phẩm.
        & $adb shell monkey -p $package -c android.intent.category.LAUNCHER 1 *> $null
        Start-Sleep -Seconds 1
      }
    }
    return $null -ne $script:found
  }
  return $script:found
}

function Tap-Node {
  param([Parameter(Mandatory)] [string] $Pattern, [int] $TimeoutSec = 60)
  $node = Wait-Node $Pattern $TimeoutSec
  if ($node.bounds -notmatch '^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$') {
    throw "Bounds không hợp lệ cho $Pattern"
  }
  $x = [int](([int]$matches[1] + [int]$matches[3]) / 2)
  $y = [int](([int]$matches[2] + [int]$matches[4]) / 2)
  Adb shell input tap $x $y
}

function Save-Diagnostics {
  $shot = Join-Path $Artifacts "android-failure.png"
  $start = [System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $adb
  $start.Arguments = "exec-out screencap -p"
  $start.UseShellExecute = $false
  $start.RedirectStandardOutput = $true
  $process = [System.Diagnostics.Process]::Start($start)
  $file = [System.IO.File]::Create($shot)
  try { $process.StandardOutput.BaseStream.CopyTo($file); $process.WaitForExit() } finally { $file.Dispose(); $process.Dispose() }
  & $adb logcat -d *> (Join-Path $Artifacts "android-logcat.log")
  try { (Get-UiXml).Save((Join-Path $Artifacts "android-window.xml")) } catch { }
}

try {
  if (-not (Test-Path $adb)) { throw "Không tìm thấy adb: $adb" }
  $devices = & $adb devices
  if (-not ($devices -match '^emulator-\d+\s+device' )) {
    $emulatorLog = Join-Path $Artifacts "android-emulator.log"
    Start-Process -FilePath $emulator -ArgumentList @("-avd", $avd, "-no-snapshot-save", "-no-boot-anim") `
      -WindowStyle Hidden -RedirectStandardOutput $emulatorLog -RedirectStandardError (Join-Path $Artifacts "android-emulator.stderr.log") | Out-Null
    $startedEmulator = $true
  }
  Adb wait-for-device
  Wait-Until -Description "Android boot" -TimeoutSec 180 -Condition {
    ((& $adb shell getprop sys.boot_completed | Out-String).Trim()) -eq "1"
  }
  & $adb shell svc bluetooth disable *> $null
  Adb reverse tcp:41731 tcp:41731

  $env:EXPO_PUBLIC_VONG_ORIGIN = "http://10.0.2.2:3000"
  $env:EXPO_PUBLIC_VONG_E2E = "1"
  $manifest = Join-Path $mobile "android\app\src\main\AndroidManifest.xml"
  if (-not (Test-Path $manifest) -or -not (Select-String -Path $manifest -SimpleMatch 'android:usesCleartextTraffic="true"' -Quiet)) {
    Push-Location $mobile
    try {
      & npx.cmd expo prebuild --platform android --no-install *> (Join-Path $Artifacts "android-prebuild.log")
      if ($LASTEXITCODE -ne 0) { throw "Expo prebuild E2E thất bại" }
    } finally { Pop-Location }
  }
  $gradleLog = Join-Path $Artifacts "android-gradle.log"
  $keystorePassword = (Get-Content (Join-Path $mobile "credentials\keystore-pass.txt") -Raw).Trim()
  if ($keystorePassword.Length -eq 0) { throw "Mật khẩu keystore Android đang trống" }
  $oldErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  Push-Location (Join-Path $mobile "android")
  try {
    & (Join-Path $mobile "android\gradlew.bat") assembleRelease --no-daemon --console=plain `
      -PreactNativeArchitectures=x86_64 "-PVONG_UPLOAD_STORE_PASSWORD=$keystorePassword" `
      *> $gradleLog
    $gradleExit = $LASTEXITCODE
  } finally {
    Pop-Location
    $ErrorActionPreference = $oldErrorPreference
  }
  if ($gradleExit -ne 0) { throw "Gradle assembleRelease thất bại" }

  $apk = Join-Path $mobile "android\app\build\outputs\apk\release\app-release.apk"
  if (-not (Test-Path $apk)) { throw "Không có APK release E2E" }
  & $adb uninstall $package *> $null
  Adb install $apk
  Adb shell monkey -p $package -c android.intent.category.LAUNCHER 1
  Start-Sleep -Seconds 2
  if ($null -ne (Find-Node "^Close app$")) { Tap-Node "^Close app$" }
  Wait-Node "Đăng nhập bằng Google" 120 | Out-Null

  $handoffFile = Join-Path $Artifacts "android-handoff.json"
  & npx.cmd dotenv -e .env.local -- tsx scripts/e2e-fixture.ts handoff --output $handoffFile `
    *> (Join-Path $Artifacts "android-handoff.log")
  if ($LASTEXITCODE -ne 0) { throw "Không phát được handoff code" }
  $code = (Get-Content $handoffFile -Raw | ConvertFrom-Json).code
  Adb shell am start -a android.intent.action.VIEW -d "vong://auth?code=$code" $package
  Wait-Node "Trang chủ" 120 | Out-Null
  Wait-Node "Có Vọng 9.9.9" 60 | Out-Null
  Tap-Node "Để sau"

  Tap-Node "Thư viện"
  Wait-Node "Sóng Thử Nghiệm Ba" 60 | Out-Null
  Tap-Node "Thêm vào Yêu thích"
  Wait-Node "Bỏ khỏi Yêu thích" 60 | Out-Null
  Tap-Node "Sóng Thử Nghiệm Ba"
  # MediaSession is the authoritative playback oracle. The RN accessibility tree
  # can miss a short-lived label update while uiautomator is serialising it.
  Wait-MediaPlaying 0
  # Exercise the native MediaSession next action as well as the in-app store path
  # already covered by web/Windows. This is also the path used from the lock screen.
  Adb logcat -c
  Adb shell input keyevent KEYCODE_MEDIA_NEXT
  # The engine deliberately rebuilds its two-item native window after a track
  # change, so index 1 exists only briefly. Observe the transition event instead
  # of polling the eventual (renormalised) queue index 0.
  Wait-MediaNextTransition
  Wait-MediaPlaying 0

  Adb shell input keyevent KEYCODE_HOME
  Start-Sleep -Seconds 3
  $media = Get-MediaSession
  if ($media -notmatch 'state=(?:PLAYING\()?3\)?') {
    throw "MediaSession không xác nhận phát nền"
  }
  # Stop the 60fps mini-progress animation before further uiautomator dumps;
  # otherwise Android waits forever for an accessibility-idle window.
  Adb shell input keyevent KEYCODE_MEDIA_PAUSE
  Wait-MediaPaused
  Adb shell monkey -p $package -c android.intent.category.LAUNCHER 1
  Wait-Node "Sóng Thử Nghiệm Hai" 60 | Out-Null

  # The target AVD has a fixed 1080x2400 viewport. After a HOME/resume cycle,
  # Android 16 occasionally reports the tab as clickable but drops accessibility-
  # derived taps; a coordinate tap exercises the same visible tab reliably.
  Adb shell input tap 540 2260
  Wait-Until -Description "ô tìm kiếm" -TimeoutSec 60 -Condition {
    $xml = Get-UiXml
    return $null -ne ($xml.SelectNodes("//node") | Where-Object { $_.class -eq "android.widget.EditText" } | Select-Object -First 1)
  }
  $input = (Get-UiXml).SelectNodes("//node") | Where-Object { $_.class -eq "android.widget.EditText" } | Select-Object -First 1
  if ($input.bounds -notmatch '^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$') { throw "Không đọc được bounds ô tìm kiếm" }
  Adb shell input tap ([int](([int]$matches[1] + [int]$matches[3]) / 2)) ([int](([int]$matches[2] + [int]$matches[4]) / 2))
  Adb shell input text "Song%sthu%snghiem"
  Wait-Node "Sóng Thử Nghiệm Một" 90 | Out-Null

  Adb shell input keyevent KEYCODE_BACK
  Tap-Node "Thư viện"
  Tap-Node "Playlist"
  Wait-Node "Playlist E2E Ổn Định" 60 | Out-Null
  Tap-Node "Trang chủ"
  Tap-Node "Yêu thích"
  Wait-Node "Sóng Thử Nghiệm Ba" 60 | Out-Null
  Write-Host "Android E2E passed"
} catch {
  Save-Diagnostics
  throw
} finally {
  if ($startedEmulator) { & $adb emu kill *> $null }
  Remove-Item Env:EXPO_PUBLIC_VONG_E2E -ErrorAction SilentlyContinue
  Remove-Item Env:EXPO_PUBLIC_VONG_ORIGIN -ErrorAction SilentlyContinue
}
