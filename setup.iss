[Setup]
AppName=Docker Manager App
AppVersion=1.0.2
DefaultDirName={pf}\Docker Manager
DefaultGroupName=Docker Manager
OutputDir=dist
OutputBaseFilename=docker-manager-setup
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64

[Files]
Source: ".next\standalone\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: ".next\static\*"; DestDir: "{app}\.next\static"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist
Source: "launcher.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "launcher-ui.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "Microsoft.Web.WebView2.Core.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "Microsoft.Web.WebView2.WinForms.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "WebView2Loader.dll"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Docker Manager"; Filename: "{app}\launcher.exe"
Name: "{commondesktop}\Docker Manager"; Filename: "{app}\launcher.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Run]
Filename: "{app}\launcher.exe"; Description: "Launch Docker Manager"; Flags: nowait postinstall skipifsilent shellexec
