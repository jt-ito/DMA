[Setup]
AppName=Docker Manager App
AppVersion=1.0.2
DefaultDirName={tmp}\Docker Manager Portable
DisableProgramGroupPage=yes
DisableDirPage=yes
DisableReadyPage=yes
DisableFinishedPage=yes
DisableWelcomePage=yes
Uninstallable=no
OutputDir=dist
OutputBaseFilename=docker-manager-portable
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest

[Files]
Source: ".next\standalone\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "launcher.exe"; DestDir: "{app}"; Flags: ignoreversion

[Run]
Filename: "{app}\launcher.exe"; Description: "Launch Docker Manager"; Flags: nowait skipifsilent shellexec
