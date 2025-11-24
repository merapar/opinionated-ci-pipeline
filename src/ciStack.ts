import {Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {ManagedPolicy} from 'aws-cdk-lib/aws-iam';
import {FeatureBranchBuilds} from './constructs/featureBranchBuilds';
import {MainPipeline} from './constructs/mainPipeline';
import {ResolvedApplicationProps, SlackChannelConfig, SlackNotifications} from './applicationProps';
import {SlackChannelConfiguration} from 'aws-cdk-lib/aws-chatbot';
import {ITopic, Topic} from 'aws-cdk-lib/aws-sns';
import {NotificationsTopic} from './constructs/notificationsTopic';
import {getProjectName} from './util/context';
import {StringParameter} from 'aws-cdk-lib/aws-ssm';
import {MirrorRepository} from './constructs/mirrorRepository';
import {capitalizeFirstLetter} from './util/string';
import { applyRequiredTagsToStack } from './util/tags';

export interface CIStackProps extends StackProps, ResolvedApplicationProps {
}

export class CIStack extends Stack {
    constructor(scope: Construct, id: string, props: CIStackProps) {
        super(scope, id, props);

        applyRequiredTagsToStack(this, props.tags || {});

        const repositoryTokenParam = StringParameter.fromSecureStringParameterAttributes(this, 'RepositoryTokenParam', {
            parameterName: `/${getProjectName(this)}/ci/repositoryAccessToken`,
        });

        const mirror = new MirrorRepository(this, 'MirrorRepository', {
            repoTokenParam: repositoryTokenParam,
            repository: props.repository,
        });

        const mainPipeline = new MainPipeline(this, 'MainPipeline', {
            ...props,
            sourceBucket: mirror.sourceBucket,
            repositoryTokenParam,
        });

        const featureBranchBuilds = new FeatureBranchBuilds(this, 'FeatureBranchBuilds', {
            ...props,
            sourceBucket: mirror.sourceBucket,
            repositoryTokenParam,
        });

        if (props.slackNotifications) {
            this.createSlackNotifications(getProjectName(this), props.slackNotifications, mainPipeline.failuresTopic, featureBranchBuilds.failuresTopic);
        }
    }

    private createSlackNotifications(
        projectName: string, slackNotificationsConfig: SlackNotifications,
        mainPipelineFailuresTopic: Topic, featureBranchFailuresTopic: Topic,
    ) {
        const {mainPipelineFailures, featureBranchFailures} = slackNotificationsConfig;

        if (mainPipelineFailures) {
            const alarmsTopic = new NotificationsTopic(this, 'SlackAlarmsTopic', {
                projectName: projectName,
                notificationName: 'slackAlarms',
            });
            this.createSlackChannelConfiguration('main', mainPipelineFailures, [alarmsTopic.topic, mainPipelineFailuresTopic]);
        }

        if (featureBranchFailures) {
            this.createSlackChannelConfiguration('feature', featureBranchFailures, [featureBranchFailuresTopic]);
        }
    }

    private createSlackChannelConfiguration(name: string, config: SlackChannelConfig, topics: ITopic[]): SlackChannelConfiguration {
        const lowercasedName = name.toLowerCase();
        const slackChannelConfiguration = new SlackChannelConfiguration(this, `${capitalizeFirstLetter(lowercasedName)}SlackChannelConfiguration`, {
            slackChannelConfigurationName: `${this.stackName}-${lowercasedName}`,
            slackWorkspaceId: config.workspaceId,
            slackChannelId: config.channelId,
            notificationTopics: topics,
        });
        slackChannelConfiguration.role?.addManagedPolicy(
            ManagedPolicy.fromAwsManagedPolicyName('CloudWatchReadOnlyAccess'),
        );
        return slackChannelConfiguration;
    }
}
