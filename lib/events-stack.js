// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const { Stack, CfnOutput, RemovalPolicy, Duration, Size } = require('aws-cdk-lib')
const { Role, PolicyStatement, PolicyDocument, ServicePrincipal } = require('aws-cdk-lib/aws-iam')
const { Stream, StreamEncryption } = require('aws-cdk-lib/aws-kinesis')
const { DeliveryStream, LambdaFunctionProcessor } = require('@aws-cdk/aws-kinesisfirehose-alpha')
const destinations = require('@aws-cdk/aws-kinesisfirehose-destinations-alpha')
const { Bucket, BlockPublicAccess, BucketEncryption, BucketAccessControl, HttpMethods } = require('aws-cdk-lib/aws-s3')
const { IdentityPool } = require('@aws-cdk/aws-cognito-identitypool-alpha')
const { Distribution, OriginAccessIdentity, OriginRequestPolicy, GeoRestriction, ResponseHeadersPolicy } = require('aws-cdk-lib/aws-cloudfront')
const { S3Origin } = require('aws-cdk-lib/aws-cloudfront-origins')
const { Function, Code, Runtime } = require('aws-cdk-lib/aws-lambda')
const wafv2 = require('aws-cdk-lib/aws-wafv2')
const path = require('node:path')
const { NagSuppressions } = require('cdk-nag')

class EventsStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor (scope, id, props) {
    super(scope, id, props)

    const stream = new Stream(this, 'ClickStream', {
      encryption: StreamEncryption.MANAGED
    })
    const logsBucket = new Bucket(this, 'logsBucket', {
      enforceSSL: true,
      versioned: true,
      accessControl: BucketAccessControl.LOG_DELIVERY_WRITE
    })
    NagSuppressions.addResourceSuppressions(logsBucket, [
      { id: 'AwsSolutions-S1', reason: 'This is THE DESTINATION for logs, cannot self reference' }
    ])

    const rawBucket = new Bucket(this, 'rawBucket', {
      enforceSSL: true,
      versioned: true,
      serverAccessLogsBucket: logsBucket
    }) // backup

    const outputBucket = new Bucket(this, 'outputBucket', {
      enforceSSL: true,
      versioned: true,
      serverAccessLogsBucket: logsBucket
    })

    const enricherPolicy = new PolicyDocument({
      statements: [new PolicyStatement({
        actions: ['logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents'],
        resources: ['*']
      })]
    })

    const enricherRole = new Role(this, 'enricherRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        cloudwatch: enricherPolicy
      }
    })
    NagSuppressions.addResourceSuppressions(enricherRole, [
      { id: 'AwsSolutions-IAM5', reason: 'Dynamic log naming' }
    ])

    const enricher = new Function(this, 'enricher', {
      code: Code.fromAsset(path.join(__dirname, '../lambda/enricher')),
      handler: 'index.handler',
      runtime: Runtime.NODEJS_18_X,
      role: enricherRole
    })

    const lambdaProcessor = new LambdaFunctionProcessor(enricher, {
      bufferInterval: Duration.minutes(1),
      bufferSize: Size.mebibytes(0.2),
      retries: 5
    })

    const s3DestinationS3Policy = new PolicyDocument({
      statements: [new PolicyStatement({
        actions: ['s3:AbortMultipartUpload',
          's3:DeleteObject',
          's3:DeleteObjectVersion',
          's3:DeleteObjectTagging',
          's3:DeleteObjectVersionTagging',
          's3:GetBucket*',
          's3:GetObject*',
          's3:List*',
          's3:PutObject',
          's3:PutObjectLegalHold',
          's3:PutObjectRetention',
          's3:PutObjectTagging',
          's3:PutObjectVersionTagging'],
        resources: [rawBucket.bucketArn + '/*', outputBucket.bucketArn + '/*']
      })]
    })

    const s3DestinationLambdaPolicy = new PolicyDocument({
      statements: [new PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [enricher.functionArn]
      })]
    })

    const s3DestinationLogsPolicy = new PolicyDocument({
      statements: [new PolicyStatement({
        actions: ['logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents'],
        resources: ['*']
      })]
    })

    const s3DestinationRole = new Role(this, 's3DestinationRole', {
      assumedBy: new ServicePrincipal('firehose.amazonaws.com'),
      inlinePolicies: {
        s3: s3DestinationS3Policy,
        lambda: s3DestinationLambdaPolicy,
        logs: s3DestinationLogsPolicy
      }
    }).withoutPolicyUpdates()

    NagSuppressions.addResourceSuppressions(s3DestinationRole, [
      { id: 'AwsSolutions-IAM5', reason: 'Dynamic log naming' }
    ])

    const s3Destination = new destinations.S3Bucket(outputBucket, {
      role: s3DestinationRole,
      compression: destinations.Compression.SNAPPY,
      processor: lambdaProcessor,
      s3Backup: {
        compression: destinations.Compression.GZIP,
        mode: destinations.BackupMode.ALL,
        bucket: rawBucket
      }
    })

    const deliveryStream = new DeliveryStream(this, 'Delivery Stream', {
      sourceStream: stream,
      destinations: [s3Destination]
    })
    NagSuppressions.addResourceSuppressions(deliveryStream, [
      { id: 'AwsSolutions-KDF1', reason: 'Cannot set encryption in firehose well input stream comes from Kinesis and is already encrypted' }
    ])

    const pool = new IdentityPool(this, 'ClickStreamPool', { allowUnauthenticatedIdentities: true })
    NagSuppressions.addResourceSuppressions(pool, [
      { id: 'AwsSolutions-COG7', reason: 'Unauthenticated access is needed por Kinesis events' }
    ])
    stream.grantWrite(pool.unauthenticatedRole)

    const bucket = new Bucket(this, 'Bucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      serverAccessLogsBucket: logsBucket
    })

    // CloudFront Distribution
    const originAccessIdentity = new OriginAccessIdentity(this, 'OriginAccessIdentity')
    bucket.grantRead(originAccessIdentity)

    const policy = new ResponseHeadersPolicy(this, 'ResponseHeadersPolicy',
      {
        corsBehavior: {
          accessControlAllowCredentials: false,
          accessControlAllowHeaders: ['*'],
          accessControlAllowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
          accessControlAllowOrigins: ['*'],
          originOverride: true
        }
      })

    const cfnWebACL = new wafv2.CfnWebACL(this,
      'MyCDKWebAcl', {
        defaultAction: {
          allow: {}
        },
        scope: 'CLOUDFRONT',
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'MetricForWebACLCDK',
          sampledRequestsEnabled: true
        }
      })

    const distribution = new Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new S3Origin(bucket, { originAccessIdentity }),
        // originRequestPolicy: OriginRequestPolicy.CORS_S3_ORIGIN,
        responseHeadersPolicy: policy
      },
      logBucket: logsBucket,
      webAclId: cfnWebACL.attrArn,
      geoRestriction: GeoRestriction.allowlist('AR', 'BR', 'MX', 'CO', 'CL') // sample allowed countries
    })

    NagSuppressions.addResourceSuppressions(distribution, [
      { id: 'AwsSolutions-CFR4', reason: 'Cannot use a custom certificate to enforce TLS1.1 on a PoC as it implies getting a domain name' }
    ])

    new CfnOutput(this, 'streamName', {
      value: stream.streamName
    })

    new CfnOutput(this, 'poolId', {
      value: pool.identityPoolId
    })

    new CfnOutput(this, 'bucket', {
      value: bucket.bucketName
    })

    new CfnOutput(this, 'distributionDomainName', {
      value: distribution.distributionDomainName
    })

    new CfnOutput(this, 'distributionId', {
      value: distribution.distributionId
    })

    new CfnOutput(this, 'region', {
      value: Stack.of(this).region
    })
  }
}

module.exports = { EventsStack }
