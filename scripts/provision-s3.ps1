# Provision the S3 bucket for the demo: create it, block public access,
# and add the CORS rule the browser needs for presigned PUT/GET from localhost.
#
# Usage: .\provision-s3.ps1 -Bucket <bucket-name> [-Region us-east-1]
param(
    [Parameter(Mandatory = $true)][string]$Bucket,
    [string]$Region = "us-east-1"
)

$ErrorActionPreference = "Stop"

Write-Host "Creating bucket s3://$Bucket in $Region..."
if ($Region -eq "us-east-1") {
    # us-east-1 rejects an explicit LocationConstraint
    aws s3api create-bucket --bucket $Bucket --region $Region
} else {
    aws s3api create-bucket --bucket $Bucket --region $Region `
        --create-bucket-configuration "LocationConstraint=$Region"
}
if ($LASTEXITCODE -ne 0) { throw "create-bucket failed" }

Write-Host "Blocking all public access..."
aws s3api put-public-access-block --bucket $Bucket `
    --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
if ($LASTEXITCODE -ne 0) { throw "put-public-access-block failed" }

Write-Host "Applying CORS rule for http://localhost:8080..."
$cors = @'
{
  "CORSRules": [
    {
      "AllowedOrigins": ["http://localhost:8080", "http://localhost:5173"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
'@
$corsFile = New-TemporaryFile
Set-Content -Path $corsFile -Value $cors -NoNewline
aws s3api put-bucket-cors --bucket $Bucket --cors-configuration "file://$corsFile"
$corsExit = $LASTEXITCODE
Remove-Item $corsFile -Force
if ($corsExit -ne 0) { throw "put-bucket-cors failed" }

Write-Host ""
Write-Host "Done. Run the server with:"
Write-Host "  `$env:S3_BUCKET = '$Bucket'; `$env:AWS_REGION = '$Region'; go run ./server"
