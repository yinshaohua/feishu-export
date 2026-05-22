$ExternalNodeModules = "C:/local_data/feishu-export/node_modules"
$ExternalNodeBin = "$ExternalNodeModules/.bin"

$env:FEISHU_EXPORT_NODE_MODULES = $ExternalNodeModules
$env:NODE_PATH = $ExternalNodeModules
$env:PATH = "$ExternalNodeBin;$env:PATH"

$PathFirst = ($env:PATH -split ';' | Select-Object -First 1)

Write-Host "External node_modules enabled:"
Write-Host "FEISHU_EXPORT_NODE_MODULES=$env:FEISHU_EXPORT_NODE_MODULES"
Write-Host "NODE_PATH=$env:NODE_PATH"
Write-Host "PATH[0]=$PathFirst"
