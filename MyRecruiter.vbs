Set WshShell = CreateObject("WScript.Shell")
' Run npm run app completely hidden (0) so no terminal window appears
WshShell.Run "cmd /c npm run app", 0, False
