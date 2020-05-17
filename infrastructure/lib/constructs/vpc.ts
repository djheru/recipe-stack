import { Construct } from '@aws-cdk/core';
import { GatewayVpcEndpointAwsService, Vpc, SubnetType, VpcProps, SecurityGroup, Port, Peer } from '@aws-cdk/aws-ec2';
import { Environment } from '../pillar-stack';

export interface VpcConstructProps extends VpcProps {
  name: string;
  environmentName: Environment;
}

export enum DefaultCidr {
  demo = '10.100.0.0/16',
  dev = '10.110.0.0/16',
  prod = '10.120.0.0/16',
}

export type ValidDefaultCidr = keyof typeof DefaultCidr;

const buildSubnetCidrs = (cidr: string) => {
  const octets = cidr.split('.');
  const firstTwo = `${octets[0]}.${octets[1]}`;
  const subnetSegments = ['8', '16', '24', '32'];
  const [publicSubnet1, publicSubnet2, privateSubnet1, privateSubnet2] = subnetSegments.map((seg) => `${firstTwo}.${seg}.0/21`);
  return { publicSubnet1, publicSubnet2, privateSubnet1, privateSubnet2 };
};

export class PillarVpc extends Construct {
  public instance: Vpc;
  constructor(scope: Construct, id: string, props: VpcConstructProps) {
    super(scope, id);

    const { name, environmentName, ...restProps } = props;
    const vpcId = `pillar-${name}-${environmentName}`;
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
  }
}
