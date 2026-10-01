param([string]$InputArchive)
$ErrorActionPreference = 'Stop'
$wrapperDirectory = Split-Path $PSScriptRoot -Parent
function Assert-CommandResult([string]$Label) {
  if ($LASTEXITCODE -ne 0) { throw "$Label failed: $LASTEXITCODE" }
}
if ((node -p 'process.versions.node') -ne '26.7.0') { throw 'Use Node.js 26.7.0 for the pinned build toolchain.' }
if ((pnpm --version) -ne '11.7.0') { throw 'Install pnpm 11.7.0 before preparing this checkout.' }
Push-Location $wrapperDirectory
try {
  if ($InputArchive) { node scripts/prepare-build-inputs.mjs $InputArchive }
  else { node scripts/prepare-build-inputs.mjs }
  Assert-CommandResult 'Pinned input preparation'
  foreach ($plugin in @('models-settings-plugin', 'cpa-provider-plugin', 'agent-teams-plugin')) {
    Push-Location $plugin
    try {
      pnpm install --frozen-lockfile --ignore-scripts
      Assert-CommandResult "$plugin frozen install"
    } finally { Pop-Location }
  }
  npm ci --install-links=true --ignore-scripts
  Assert-CommandResult 'Wrapper frozen install'
  node node_modules/electron/install.js
  Assert-CommandResult 'Electron runtime installation'
  # npm ci --ignore-scripts still installs package binaries; rebuild only their
  # command links explicitly, without executing unrelated install hooks.
  npm rebuild --ignore-scripts
  Assert-CommandResult 'Command link preparation'
} finally { Pop-Location }
