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
Source: "launcher.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Docker Manager"; Filename: "{app}\launcher.exe"
Name: "{commondesktop}\Docker Manager"; Filename: "{app}\launcher.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Run]
Filename: "{app}\launcher.exe"; Description: "Launch Docker Manager"; Flags: nowait postinstall skipifsilent shellexec
