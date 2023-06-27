# Welcome to Web Events Ingestion Project

This project aims to be a working proof of concept of web browser generated events ingestion, using Amazon Kinesis JS SDK, enriched via AWS Lambda and being persisted in Amazon S3, for later quering using Amazon Athena, or alike.

## Requirements

* Setup AWS credentials for your environment: [instructions here](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)
* Install AWS SAM CLI: [instructions here](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
* Install AWS CDK Toolkit: [instructions here](https://docs.aws.amazon.com/cdk/v2/guide/cli.html)

## Architecture

![Architecture Diagram](assets/arch.png)

## Deployment

* `deploy.sh` file has been tailored for easier CDK deployment

## CDK

The `cdk.json` file tells the CDK Toolkit how to execute your app. The build step is not required when using JavaScript.

### Useful commands

* `npm run test`         perform the jest unit tests
* `cdk deploy`           deploy this stack to your default AWS account/region
* `cdk diff`             compare deployed stack with current state
* `cdk synth`            emits the synthesized CloudFormation template

## Reference links
- [Create real-time clickstream sessions and run analytics with Amazon Kinesis Data Analytics, AWS Glue, and Amazon Athena](https://aws.amazon.com/blogs/big-data/create-real-time-clickstream-sessions-and-run-analytics-with-amazon-kinesis-data-analytics-aws-glue-and-amazon-athena/)
- [Capturing Web Page Scroll Progress with Amazon Kinesis](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/kinesis-examples-capturing-page-scrolling.html)

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the [LICENSE](LICENSE) file.