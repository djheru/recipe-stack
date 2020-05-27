import { BlockPublicAccess, Bucket, BucketEncryption, BucketProps } from '@aws-cdk/aws-s3';
import { Construct, RemovalPolicy, Tag } from '@aws-cdk/core';
import { Environment } from './../pillar-stack';

export interface AssetBucketProps extends BucketProps {
  name: string;
  environmentName: Environment;
}

export class AssetBucket extends Construct {
  public instance: Bucket;
  constructor(scope: Construct, id: string, props: AssetBucketProps) {
    super(scope, id);
    const { name, environmentName, ...restProps } = props;

    const bucketId = `${name}-bucket`;
    const defaults = {
      versioned: false,
      bucketName: bucketId,
      encryption: BucketEncryption.KMS_MANAGED,
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
    };
    this.instance = new Bucket(this, bucketId, {
      ...defaults,
      ...restProps,
    });

    Tag.add(this, 'name', name);
    Tag.add(this, 'environmentName', environmentName);
    Tag.add(this, 'description', `Stack for ${name} running in the ${environmentName} environment`);
  }
}
