import { GatewayVpcEndpointAwsService, SubnetType, Vpc, VpcProps } from '@aws-cdk/aws-ec2';
import { CfnOutput, Construct, Tag } from '@aws-cdk/core';
import { Environment } from '../';

export interface PillarVpcProps extends VpcProps {
  name: string;
  environmentName: Environment;
}

export enum DefaultCidr {
  demo = '10.100.0.0/16',
  dev = '10.110.0.0/16',
  prod = '10.120.0.0/16',
  prototype = '10.130.0.0/16',
}

export type ValidDefaultCidr = keyof typeof DefaultCidr;

export class PillarVpc extends Construct {
  public instance: Vpc;
  private environmentName: Environment;

  public isolatedSubnetIds: string[];
  public publicSubnetIds: string[];
  public privateSubnetIds: string[];
  constructor(scope: Construct, id: string, props: PillarVpcProps) {
    super(scope, id);

    const { name, environmentName, ...restProps } = props;

    this.environmentName = environmentName;

    const vpcId = name;
    const env: ValidDefaultCidr = <ValidDefaultCidr>environmentName.toUpperCase();
    const cidr = DefaultCidr[env];
    const defaultProps = {
      cidr,
      maxAzs: 2,
      gatewayEndpoints: {
        S3: {
          service: GatewayVpcEndpointAwsService.S3,
        },
        DynamoDB: {
          service: GatewayVpcEndpointAwsService.DYNAMODB,
        },
      },
      subnetConfiguration: [
        {
          name: 'Public',
          cidrMask: 21,
          subnetType: SubnetType.PUBLIC,
        },
        {
          name: 'Private',
          cidrMask: 21,
          subnetType: SubnetType.PRIVATE,
        },
        {
          name: 'Isolated',
          cidrMask: 21,
          subnetType: SubnetType.ISOLATED,
        },
        {
          name: 'Reserved',
          cidrMask: 21,
          subnetType: SubnetType.PRIVATE,
        },
      ],
    };
    const params = { ...defaultProps, ...restProps };
    this.instance = new Vpc(this, vpcId, params);
    this.groupSubnets();

    Tag.add(this, 'name', name);
    Tag.add(this, 'environmentName', environmentName);
    Tag.add(this, 'description', `VPC for ${name} running in ${environmentName}`);
  }

  groupSubnets() {
    this.isolatedSubnetIds = this.instance.isolatedSubnets.map((sub) => sub.subnetId);
    this.privateSubnetIds = this.instance.privateSubnets.map((sub) => sub.subnetId);
    this.publicSubnetIds = this.instance.publicSubnets.map((sub) => sub.subnetId);

    new CfnOutput(this, `${this.environmentName}-vpc-isolated-subnet-ids`, {
      value: JSON.stringify(this.isolatedSubnetIds),
    });

    new CfnOutput(this, `${this.environmentName}-vpc-private-subnet-ids`, {
      value: JSON.stringify(this.privateSubnetIds),
    });

    new CfnOutput(this, `${this.environmentName}-vpc-public-subnet-ids`, {
      value: JSON.stringify(this.publicSubnetIds),
    });
  }
}
