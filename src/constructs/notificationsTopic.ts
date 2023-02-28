import {Construct} from 'constructs';
import {Topic} from 'aws-cdk-lib/aws-sns';
import {StringParameter} from 'aws-cdk-lib/aws-ssm';
import {CfnOutput} from 'aws-cdk-lib';

export interface NotificationsTopicProps {
    projectName: string;
    notificationName: string;
}

export class NotificationsTopic extends Construct {

    public readonly topic: Topic;

    constructor(scope: Construct, id: string, props: NotificationsTopicProps) {
        super(scope, id);

        this.topic = new Topic(this, 'Topic');

        new StringParameter(this, 'TopicArnParam', {
            parameterName: `/${props.projectName}/ci/${props.notificationName}TopicArn`,
            stringValue: this.topic.topicArn,
        });

        new CfnOutput(this, 'TopicArn', {
            value: this.topic.topicArn,
            exportName: `${props.projectName}-ci-${props.notificationName}TopicArn`,
        });
    }
}
