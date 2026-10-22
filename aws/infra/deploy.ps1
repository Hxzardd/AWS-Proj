param(
  [string]$StackName = "optimizer-demo",
  [string]$Region = "ap-south-1",
  [Parameter(Mandatory = $true)][string]$NotificationEmail
)

$ErrorActionPreference = "Stop"
$template = Join-Path $PSScriptRoot "stack.yml"

Write-Host "Validating template..."
aws cloudformation validate-template --template-body file://$template --region $Region | Out-Null

Write-Host "Deploying $StackName in $Region (first deploy takes ~5-8 min)..."
aws cloudformation deploy `
  --template-file $template `
  --stack-name $StackName `
  --capabilities CAPABILITY_IAM `
  --parameter-overrides NotificationEmail=$NotificationEmail `
  --region $Region

$outputs = aws cloudformation describe-stacks --stack-name $StackName --region $Region `
  --query "Stacks[0].Outputs" | ConvertFrom-Json
function Get-Out($key) { ($outputs | Where-Object { $_.OutputKey -eq $key }).OutputValue }

Write-Host "`n==== Paste into .env ===="
Write-Host (Get-Out 'EnvBlock')
Write-Host "AWS_ACCESS_KEY_ID=$(Get-Out 'ControllerAccessKeyId')"
Write-Host "AWS_SECRET_ACCESS_KEY=$(Get-Out 'ControllerSecretAccessKey')"
Write-Host "`nALB URL: http://$(Get-Out 'AlbDns')"
Write-Host "Wait ~2-3 min for instances to pass health checks, then run: npm run aws:check"
