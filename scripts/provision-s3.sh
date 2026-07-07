#!/usr/bin/env bash
# Provision the S3 bucket for the demo: create it, block public access,
# and add the CORS rule the browser needs for presigned PUT/GET from localhost.
#
# Usage: ./provision-s3.sh <bucket-name> [region]
set -euo pipefail

BUCKET="${1:?usage: $0 <bucket-name> [region]}"
REGION="${2:-us-east-1}"

echo "Creating bucket s3://$BUCKET in $REGION..."
if [ "$REGION" = "us-east-1" ]; then
  # us-east-1 rejects an explicit LocationConstraint
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
else
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration "LocationConstraint=$REGION"
fi

echo "Blocking all public access..."
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo "Applying CORS rule for http://localhost:8080..."
aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration '{
  "CORSRules": [
    {
      "AllowedOrigins": ["http://localhost:8080", "http://localhost:5173"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}'

echo
echo "Done. Run the server with:"
echo "  S3_BUCKET=$BUCKET AWS_REGION=$REGION go run ./server"
