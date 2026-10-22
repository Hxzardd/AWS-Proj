param(
  [string]$StackName = "optimizer-demo",
  [string]$Region = "ap-south-1"
)

$ErrorActionPreference = "Stop"

Write-Host "Deleting stack $StackName in $Region (this removes every demo resource)..."
aws cloudformation delete-stack --stack-name $StackName --region $Region
aws cloudformation wait stack-delete-complete --stack-name $StackName --region $Region

Write-Host "Stack deleted. Confirm with:"
Write-Host "  aws cloudformation describe-stacks --stack-name $StackName --region $Region"
Write-Host "(should report: Stack with id $StackName does not exist)"
