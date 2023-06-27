#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const cdk = require('aws-cdk-lib')
const { AwsSolutionsChecks } = require('cdk-nag')
const Aspects = cdk.Aspects
const { EventsStack } = require('../lib/events-stack')

const app = new cdk.App()
new EventsStack(app, 'EventsStack', {})
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))
