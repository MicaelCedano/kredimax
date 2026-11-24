# Revierte la redirección del launcher; conserva otros servicios de accesibilidad.
$tv = '10.0.0.24:5555'
$services = (adb -s $tv shell settings get secure enabled_accessibility_services).Trim()
$kept = @($services -split ':' | Where-Object { $_ -and $_ -ne 'null' -and $_ -notmatch '^com\.gathin\.tvhome/' })
if ($kept.Count -gt 0) { adb -s $tv shell settings put secure enabled_accessibility_services ($kept -join ':') }
else { adb -s $tv shell settings delete secure enabled_accessibility_services; adb -s $tv shell settings put secure accessibility_enabled 0 }
adb -s $tv shell pm enable --user 0 com.google.android.apps.tv.launcherx
adb -s $tv shell pm enable --user 0 com.google.android.tungsten.setupwraith
adb -s $tv shell cmd package set-home-activity --user 0 com.google.android.apps.tv.launcherx/.home.HomeActivity
adb -s $tv shell input keyevent KEYCODE_HOME
