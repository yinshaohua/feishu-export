$ProjectRoot = Get-Location
$ProjectName = Split-Path -Leaf $ProjectRoot
$ExternalRoot = "C:/local_data/$ProjectName"
$ExternalNodeModules = "$ExternalRoot/node_modules"
$ExternalNodeBin = "$ExternalNodeModules/.bin"

New-Item -ItemType Directory -Force -Path $ExternalRoot | Out-Null

$ManifestFiles = @('package.json', 'package-lock.json', '.npmrc')
foreach ($FileName in $ManifestFiles) {
  $Source = Join-Path $ProjectRoot $FileName
  if (Test-Path $Source) {
    Copy-Item -Path $Source -Destination (Join-Path $ExternalRoot $FileName) -Force
  }
}

$env:EXTERNAL_NODE_MODULES = $ExternalNodeModules
$env:NODE_PATH = $ExternalNodeModules

$ExistingPathEntries = $env:PATH -split ';' | Where-Object {
  $_ -and ($_.TrimEnd('\/') -ine $ExternalNodeBin.TrimEnd('\/'))
}
$env:PATH = (@($ExternalNodeBin) + $ExistingPathEntries) -join ';'

$PathFirst = ($env:PATH -split ';' | Select-Object -First 1)

Write-Host "External node_modules enabled:"
Write-Host "EXTERNAL_ROOT=$ExternalRoot"
Write-Host "EXTERNAL_NODE_MODULES=$env:EXTERNAL_NODE_MODULES"
Write-Host "NODE_PATH=$env:NODE_PATH"
Write-Host "PATH[0]=$PathFirst"
Write-Host "Synced npm manifest files to $ExternalRoot"
