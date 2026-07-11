[Setup]
AppName=Docker Manager App
AppVersion=1.0.0
DefaultDirName={pf}\Docker Manager
DefaultGroupName=Docker Manager
OutputDir=dist
OutputBaseFilename=docker-manager-setup
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64

[Files]
Source: ".next\standalone\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Docker Manager"; Filename: "{app}\node.exe"; Parameters: """{app}\start.js"""
Name: "{commondesktop}\Docker Manager"; Filename: "{app}\node.exe"; Parameters: """{app}\start.js"""; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Run]
Filename: "{app}\node.exe"; Parameters: """{app}\start.js"""; Description: "Launch Docker Manager"; Flags: nowait postinstall skipifsilent shellexec
