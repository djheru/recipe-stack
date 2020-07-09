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

// Common to all stacks
const hostedZoneDomainName = 'di-metal.net';
const name = 'recipes';

// Each instance of the stack represents a new full environment
const devEnvironment = 'dev';
const devStackId = `${name}-${devEnvironment}`;
const devStack = new PillarStack(app, devStackId, {
  ...pillarStackProps,
  environmentName: devEnvironment,
  hostedZoneDomainName,
  name,
});

const prodEnvironment = 'prod';
const prodStackId = `${name}-${prodEnvironment}`;
const prodStack = new PillarStack(app, prodStackId, {
  ...pillarStackProps,
  environmentName: prodEnvironment,
  hostedZoneDomainName,
  name,
});
