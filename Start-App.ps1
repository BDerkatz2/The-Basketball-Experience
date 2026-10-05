$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskNode = Get-Command node -ErrorAction SilentlyContinue
if ($taskNode) {
    & $taskNode.Source server/index.js --production
} else {
    $taskBundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (-not (Test-Path -LiteralPath $taskBundledNode)) { throw 'Install Node.js 22.13 or newer, then run pnpm install and pnpm build.' }
    & $taskBundledNode server/index.js --production
}
