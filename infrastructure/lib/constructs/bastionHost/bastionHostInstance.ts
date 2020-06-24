import {
  BastionHostLinux,
  BastionHostLinuxProps,
  InstanceClass,
  InstanceSize,
  InstanceType,
  Peer,
  SubnetType,
} from '@aws-cdk/aws-ec2';
import { Construct, Tag } from '@aws-cdk/core';
import { Environment } from '../';

export interface BastionHostInstanceProps extends BastionHostLinuxProps {
  name: string;
  environmentName: Environment;
}

export class BastionHostInstance extends Construct {
  public instance: BastionHostLinux;
  constructor(scope: Construct, id: string, props: BastionHostInstanceProps) {
    super(scope, id);

    // Connection instructions: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.
    // https://docs.aws.amazon.com/cdk/api/latest/docs/aws-ec2-readme.html#bastion-hosts
    // https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-connect-methods.html#ec2-instance-connect-connecting-aws-cli
    // https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-key-pairs.html#how-to-generate-your-own-key-and-import-it-to-aws
    // www.npmjs.com/package/@aws-cdk/aws-ec2/v/1.23.0
    /* Connecting via SSH
    # Create a key
    ssh-keygen -t rsa -f ~/.ssh/cdk_key

    # Authorize the user
    export INSTANCE_ID="i-066eb846c1a74401d" && \
    aws ec2-instance-connect send-ssh-public-key \
      --region us-west-2 \
      --instance-id $INSTANCE_ID \
      --availability-zone us-west-2a \
      --instance-os-user ec2-user \
      --ssh-public-key file://~/.ssh/cdk_key.pub

    # Connect via SSH (within 60 seconds)
    export INSTANCE_HOST="ec2-35-166-38-215.us-west-2.compute.amazonaws.com" && \
    ssh -i ~/.ssh/cdk_key ec2-user@$INSTANCE_HOST
    
    # If you don't connect within 60 sec, you get: "Permission denied (publickey,gssapi-keyex,gssapi-with-mic)."
    */
    const { name, environmentName, vpc, ...restProps } = props;
    const instanceName = `${name}-instance`;

    const defaultProps = {
      instanceName,
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
      subnetSelection: {
        subnetType: SubnetType.PUBLIC,
      },
      vpc,
    };

    this.instance = new BastionHostLinux(scope, instanceName, {
      ...defaultProps,
      ...restProps,
    });
    this.instance.allowSshAccessFrom(Peer.anyIpv4());

    Tag.add(this, 'name', name);
    Tag.add(this, 'environmentName', environmentName);
    Tag.add(this, 'description', `Stack for ${name} running in the ${environmentName} environment`);
  }
}
