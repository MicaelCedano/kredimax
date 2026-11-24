# Restaura solamente los tres paquetes habilitados antes de esta sesión.
$tv = '10.0.0.24:5555'
$packages = @('com.google.android.play.games', 'com.google.android.feedback', 'com.android.tv.feedbackconsent')
foreach ($package in $packages) { adb -s $tv shell pm enable --user 0 $package }
adb -s $tv shell pm list packages -d
