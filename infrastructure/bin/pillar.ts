#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { PillarStack, PillarStackProps } from '../lib/pillar-stack';

const app = new cdk.App();

const devStackProps: PillarStackProps = {
  environmentName: 'dev',
};
console.log(devStackProps);
const devStack = new PillarStack(app, 'PillarStack', devStackProps);
