#!/bin/bash

# TODO: add circut breakers when steps fail

outputFile=./outputs.json
rm $outputFile 2>/dev/null
configFile=assets/web/config.json
rm $configFile 2>/dev/null

npm i
cdk deploy --outputs-file $outputFile
if [ "$?" -ne 0 ]
then
    exit
fi

cat $outputFile | jq -c '.EventsStack| { region, poolId, streamName}' > $configFile

bucket=$(cat $outputFile | jq -r '.EventsStack.bucket')
aws s3 cp assets/web s3://$bucket/ --recursive

distributionId=$(cat $outputFile | jq -r '.EventsStack.distributionId')
id=$(aws cloudfront create-invalidation --distribution-id $distributionId --paths "/*" |  jq -r .Invalidation.Id)
aws cloudfront wait invalidation-completed --distribution-id $distributionId --id $id
