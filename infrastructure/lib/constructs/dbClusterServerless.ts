import { IConnectable, Port, SecurityGroup, Vpc } from '@aws-cdk/aws-ec2';
import { CfnDBCluster, CfnDBSubnetGroup, DatabaseSecret } from '@aws-cdk/aws-rds';
import { CfnOutput, Construct, Tag } from '@aws-cdk/core';
import { Environment } from './../pillar-stack';

export interface DbClusterServerlessProps {
  name: string;
  environmentName: Environment;
  subnetIds: string[];
  vpc: Vpc;
  port?: number;
  maxCapacity?: number;
  minCapacity?: number;
  secondsUntilAutoPause?: number;
  allowedConnections?: IConnectable[];
  engine?: string;
}

export class DbClusterServerless extends Construct {
  public instance: CfnDBCluster;
  public vpc: Vpc;
  public clusterName: string;
  public clusterIdentifier: string;
  public databaseName: string;
  public engine: string;
  public subnetGroup: CfnDBSubnetGroup;
  public dbSecret: DatabaseSecret;
  public securityGroup: SecurityGroup;
  public secretArn: string;
  public subnetIds: string[];
  public port: number;
  public minCapacity: number;
  public maxCapacity: number;
  public secondsUntilAutoPause: number;
  private connections: IConnectable[];

  constructor(scope: Construct, id: string, props: DbClusterServerlessProps) {
    super(scope, id);
    const { name, environmentName, subnetIds, vpc, ...restProps } = props;

    this.vpc = vpc;
    this.clusterName = name;
    this.clusterIdentifier = `${name}-cluster`;
    this.connections = restProps.allowedConnections || [];
    this.databaseName = this.clusterName.replace(/-/g, '_');
    this.engine = restProps.engine || 'aurora-postgresql';
    this.subnetIds = subnetIds;
    this.port = restProps.port || 5432;

    this.maxCapacity = restProps.maxCapacity || 4;
    this.minCapacity = restProps.minCapacity || 2;
    if (this.minCapacity < 2) {
      throw new Error(`Minimum scaling capacity for ${this.clusterName} is 2`);
    }

    this.secondsUntilAutoPause = restProps.secondsUntilAutoPause || 600;

    this.buildSecret();
    this.buildSubnetGroup();
    this.buildSecurityGroup();
    this.buildInstance();

    Tag.add(this, 'name', name);
    Tag.add(this, 'environmentName', environmentName);
    Tag.add(this, 'description', `Stack for ${name} running in the ${environmentName} environment`);
  }

  private buildSecret() {
    const secretName = `${this.clusterName}-secret`;
    this.dbSecret = new DatabaseSecret(this, secretName, {
      username: `${this.databaseName}_admin`,
    });
    this.secretArn = this.dbSecret.secretArn;
    this.exportValue({
      exportName: `${secretName}-arn`,
      value: this.secretArn,
      description: `DB Secret ARN for ${secretName}`,
    });
  }

  private buildSubnetGroup() {
    const subnetGroupName = `${this.clusterName}-subnet-group`;
    this.subnetGroup = new CfnDBSubnetGroup(this, subnetGroupName, {
      dbSubnetGroupDescription: `Subnet group to access ${this.clusterName}`,
      dbSubnetGroupName: subnetGroupName,
      subnetIds: this.subnetIds,
    });
  }

  private buildSecurityGroup() {
    const securityGroupName = `${this.clusterName}-sg`;
    this.securityGroup = new SecurityGroup(this, securityGroupName, {
      vpc: this.vpc,
      description: `Security group to control access for ${this.clusterName}`,
      securityGroupName,
    });
    this.allowConnections();
  }

  private buildInstance() {
    const params = {
      databaseName: this.databaseName,
      dbClusterIdentifier: this.clusterIdentifier,
      dbSubnetGroupName: this.subnetGroup.dbSubnetGroupName,
      enableHttpEndpoint: true,
      engine: this.engine,
      engineMode: 'serverless',
      masterUsername: this.dbSecret.secretValueFromJson('username').toString(),
      masterUserPassword: this.dbSecret.secretValueFromJson('password').toString(),
      port: this.port,
      scalingConfiguration: {
        autoPause: true,
        maxCapacity: this.maxCapacity,
        minCapacity: this.minCapacity,
        secondsUntilAutoPause: this.secondsUntilAutoPause,
      },
      storageEncrypted: true,
      vpcSecurityGroupIds: [this.securityGroup.securityGroupId],
    };

    this.instance = new CfnDBCluster(this, this.clusterName, params);

    this.instance.addDependsOn(this.subnetGroup);
  }

  private exportValue(params: { exportName: string; value: string; description: string }) {
    const { exportName, value, description } = params;
    new CfnOutput(this, exportName, {
      value,
      description,
      exportName,
    });
  }

  private allowConnections() {
    this.connections.forEach((connection) => {
      this.securityGroup.connections.allowFrom(connection, Port.tcp(this.port));
    });
  }
}
