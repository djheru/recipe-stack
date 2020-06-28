#!/usr/bin/env node
import { App, StackProps } from '@aws-cdk/core';
import 'source-map-support/register';
import { PillarStack } from '../lib/pillar-stack';

const app = new App();

const pillarStackProps: StackProps = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
};

const devStack = new PillarStack(app, 'recipe-stack', {
  ...pillarStackProps,
  environmentName: 'dev',
  hostedZoneDomainName: 'di-metal.net',
});
