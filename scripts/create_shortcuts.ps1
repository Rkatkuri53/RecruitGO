# Create Desktop Shortcut
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.IO.Path]::Combine($env:USERPROFILE, "Desktop\LinkedIn Command Center.lnk")
$Shortcut = $WshShell.CreateShortcut($DesktopPath)
$Shortcut.TargetPath = "C:\Users\rkatk\Documents\Linkedin Poster\Launch LinkedIn Agent.bat"
$Shortcut.WorkingDirectory = "C:\Users\rkatk\Documents\Linkedin Poster"
$Shortcut.IconLocation = "C:\Users\rkatk\Documents\Linkedin Poster\public\icon.ico"
$Shortcut.Save()
Write-Host "Desktop shortcut successfully registered."

# Create Start Menu Shortcut
$StartMenuPath = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\LinkedIn Command Center.lnk")
$ShortcutMenu = $WshShell.CreateShortcut($StartMenuPath)
$ShortcutMenu.TargetPath = "C:\Users\rkatk\Documents\Linkedin Poster\Launch LinkedIn Agent.bat"
$ShortcutMenu.WorkingDirectory = "C:\Users\rkatk\Documents\Linkedin Poster"
$ShortcutMenu.IconLocation = "C:\Users\rkatk\Documents\Linkedin Poster\public\icon.ico"
$ShortcutMenu.Save()
Write-Host "Start Menu shortcut successfully registered."
