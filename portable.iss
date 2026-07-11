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
Source: ".next\static\*"; DestDir: "{app}\.next\static"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist
Source: "launcher.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "launcher-ui.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "Microsoft.Web.WebView2.Core.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "Microsoft.Web.WebView2.WinForms.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "WebView2Loader.dll"; DestDir: "{app}"; Flags: ignoreversion

[Run]
Filename: "{app}\launcher.exe"; Description: "Launch Docker Manager"; Flags: nowait skipifsilent shellexec
