#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import 'source-map-support/register';
import { PillarStack } from '../lib/pillar-stack';

const app = new cdk.App();

const stackProps: cdk.StackProps = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
};
const stack = new PillarStack(app, 'recipe-stack', stackProps);

stack.buildStage('dev');
