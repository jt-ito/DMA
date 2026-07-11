const compile = require('innosetup-compiler');
const { execSync } = require('child_process');
function build(file) {
  return new Promise((resolve, reject) => {
    compile(file, { gui: false }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function main() {
  try {
    console.log('Ensuring WebView2 is downloaded...');
    const fs = require('fs');
    if (!fs.existsSync('Microsoft.Web.WebView2.Core.dll')) {
      execSync('curl.exe -s -L -o webview2.zip https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/1.0.2592.51', { stdio: 'inherit' });
      execSync('powershell -command "Expand-Archive -Force webview2.zip -DestinationPath webview2"', { stdio: 'inherit' });
      fs.copyFileSync('webview2/lib/net462/Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.Core.dll');
      fs.copyFileSync('webview2/lib/net462/Microsoft.Web.WebView2.WinForms.dll', 'Microsoft.Web.WebView2.WinForms.dll');
      fs.copyFileSync('webview2/runtimes/win-x64/native/WebView2Loader.dll', 'WebView2Loader.dll');
    }

    console.log('Compiling launcher.cs...');
    const cscPath = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
    execSync(`"${cscPath}" /target:winexe /out:launcher.exe /r:Microsoft.Web.WebView2.Core.dll /r:Microsoft.Web.WebView2.WinForms.dll launcher.cs`, { stdio: 'inherit' });

    console.log('Building setup installer...');
    await build('setup.iss');
    console.log('Building portable executable...');
    await build('portable.iss');
    console.log('All executables built successfully in dist/ folder!');
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
main();
