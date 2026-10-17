$targetPath = "C:\Users\rkatk\Documents\Linkedin Poster\MyRecruiter.vbs"
$shortcutPath = "$env:USERPROFILE\Desktop\MyRecruiter.lnk"
$workingDir = "C:\Users\rkatk\Documents\Linkedin Poster"

$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = $targetPath
$Shortcut.WorkingDirectory = $workingDir
$Shortcut.IconLocation = "imageres.dll, 109"
$Shortcut.Description = "MyRecruiter Agent"
$Shortcut.Save()

Write-Host "Desktop shortcut created successfully at $shortcutPath"
