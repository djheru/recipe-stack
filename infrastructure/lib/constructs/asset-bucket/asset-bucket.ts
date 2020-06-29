import { BlockPublicAccess, Bucket, BucketEncryption, BucketProps } from '@aws-cdk/aws-s3';
import { Construct, RemovalPolicy, Tag } from '@aws-cdk/core';
import { Environment } from '..';

export interface AssetBucketProps extends BucketProps {
  environmentName: Environment;
  name: string;
}

export class AssetBucket extends Construct {
  public instance: Bucket;

  constructor(scope: Construct, id: string, props: AssetBucketProps) {
    super(scope, id);
    const { environmentName, name, ...restProps } = props;

    const bucketId = `${name}-bucket`;
    const defaults = {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      bucketName: bucketId,
      encryption: BucketEncryption.KMS_MANAGED,
      publicReadAccess: false,
      removalPolicy: RemovalPolicy.DESTROY,
      versioned: false,
    };
    this.instance = new Bucket(this, bucketId, {
      ...defaults,
      ...restProps,
    });

    Tag.add(this, 'name', name);
    Tag.add(this, 'environmentName', environmentName);
    Tag.add(this, 'description', `Asset bucket for ${name} running in ${environmentName}`);
  }
}
