#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { PillarStack, PillarStackProps } from '../lib/pillar-stack';

const app = new cdk.App();

const devStackProps: PillarStackProps = {
  environmentName: 'dev',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
};
console.log(devStackProps);
const devStack = new PillarStack(app, 'PillarStack', devStackProps);
