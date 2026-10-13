$runtime = Join-Path $PSScriptRoot '..\.tools\node-v24.21.0-win-x64'
if (-not (Test-Path (Join-Path $runtime 'node.exe'))) {
  throw 'Portable runtime unavailable. Install Node.js 24 LTS with approval, or place the verified portable release in .tools.'
}
$env:PATH = "$((Resolve-Path $runtime).Path);$env:PATH"
$portableGit = Join-Path $PSScriptRoot '..\.tools\git\cmd'
if (Test-Path (Join-Path $portableGit 'git.exe')) { $env:PATH = "$((Resolve-Path $portableGit).Path);$env:PATH" }
$env:npm_config_cache = Join-Path $PSScriptRoot '..\.tools\npm-cache'
node --version
npm.cmd --version
