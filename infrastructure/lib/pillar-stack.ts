import * as cdk from '@aws-cdk/core';
import { PillarVpc } from './constructs/vpc';
import { BastionHostInstance } from './constructs/bastionHostInstance';
import { AssetBucket } from './constructs/assetBucket';
// import { DbCluster } from './constructs/dbCluster';
import { DbClusterServerless } from './constructs/dbClusterServerless';

export type Environment = 'demo' | 'dev' | 'prod' | 'prototype';

export interface PillarStackProps extends cdk.StackProps {
  environmentName: Environment;
}

export class PillarStack extends cdk.Stack {
  public environmentName: Environment;

  constructor(scope: cdk.Construct, id: string, props: PillarStackProps) {
    super(scope, id, props);

    this.environmentName = props.environmentName as Environment;

    const pillarVpc = new PillarVpc(this, 'vpc', {
      name: 'vpc',
      environmentName: this.environmentName,
    });

    const bastionHost = new BastionHostInstance(this, 'bastionHostInstance', {
      name: 'bastionHost',
      environmentName: this.environmentName,
      vpc: pillarVpc.instance,
    });

    const assetBucket = new AssetBucket(this, 'assetBucket', {
      name: 'assetBucket',
      environmentName: this.environmentName,
    });

    // const usersDbCluster = new DbCluster(this, 'usersDb', {
    //   name: 'users',
    //   environmentName: this.environmentName,
    //   vpc: pillarVpc.instance,
    //   allowedConnections: [bastionHost.instance],
    // });

    const usersDbCluster = new DbClusterServerless(this, 'usersDb', {
      name: 'users',
      environmentName: this.environmentName,
      vpc: pillarVpc.instance,
      subnetIds: pillarVpc.isolatedSubnetIds,
      allowedConnections: [bastionHost.instance],
    });
  }
}
