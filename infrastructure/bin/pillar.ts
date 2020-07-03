#!/usr/bin/env node
import { App, StackProps } from '@aws-cdk/core';
import 'source-map-support/register';
import { PillarStack } from '../lib/pillar-stack';

// The app is the root of the construct tree
const app = new App();

// It is a best practice to explicitly define the account and region,
// which are pulled from environment variables
const pillarStackProps: StackProps = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
};

// Each instance of the stack represents a new full environment
const devStack = new PillarStack(app, 'recipe-stack-dev', {
  ...pillarStackProps,
  environmentName: 'dev',
  hostedZoneDomainName: 'di-metal.net',
});

const prodStack = new PillarStack(app, 'recipe-stack-prod', {
  ...pillarStackProps,
  environmentName: 'prod',
  hostedZoneDomainName: 'di-metal.net',
});
