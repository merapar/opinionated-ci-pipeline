import {Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {cloneDeep, defaultsDeep, merge} from 'lodash';
import {ManagedPolicy} from 'aws-cdk-lib/aws-iam';
import {FeatureBranchBuilds} from './constructs/featureBranchBuilds';
import {MainPipeline} from './constructs/mainPipeline';
import {
    ApplicationProps,
    defaultProps,
    ResolvedApplicationProps,
    SlackChannelConfig,
    SlackNotifications,
} from './applicationProps';
import {SlackChannelConfiguration} from 'aws-cdk-lib/aws-chatbot';
import {ITopic, Topic} from 'aws-cdk-lib/aws-sns';
import {NotificationsTopic} from './constructs/notificationsTopic';
import {getProjectName} from './util/context';
import {StringParameter} from 'aws-cdk-lib/aws-ssm';
import {MirrorRepository} from './constructs/mirrorRepository';
import {capitalizeFirstLetter} from './util/string';

const defaultCommands: { [key in NonNullable<ApplicationProps['packageManager']>]: Exclude<ApplicationProps['commands'], undefined> } = {
    npm: {
        install: [
            'npm install --location=global aws-cdk@2',
            'npm ci',
        ],
    },
    pnpm: {
        install: [
            'npm install --location=global aws-cdk@2 pnpm',
            'pnpm install --frozen-lockfile',
        ],
    },
};

export interface CIStackProps extends StackProps, ApplicationProps {
}

export class CIStack extends Stack {
    constructor(scope: Construct, id: string, props: CIStackProps) {
        super(scope, id, props);

        const resolvedProps = this.resolveProps(props);
        const projectName = getProjectName(this);

        const repositoryTokenParam = StringParameter.fromSecureStringParameterAttributes(this, 'RepositoryTokenParam', {
            parameterName: `/${getProjectName(this)}/ci/repositoryAccessToken`,
        });

        const mirror = new MirrorRepository(this, 'MirrorRepository', {
            repoTokenParam: repositoryTokenParam,
            repository: resolvedProps.repository,
        });

        const mainPipeline = new MainPipeline(this, 'MainPipeline', {
            ...resolvedProps,
            codeCommitRepository: mirror.codeCommitRepository,
            repositoryTokenParam,
        });

        const featureBranchBuilds = new FeatureBranchBuilds(this, 'FeatureBranchBuilds', {
            ...resolvedProps,
            codeCommitRepository: mirror.codeCommitRepository,
            repositoryTokenParam,
        });

        if (resolvedProps.slackNotifications) {
            this.createSlackNotifications(projectName, resolvedProps.slackNotifications, mainPipeline.failuresTopic, featureBranchBuilds.failuresTopic);
        }
    }

    private resolveProps(props: ApplicationProps): ResolvedApplicationProps {
        if (props.packageManager) {
            merge(defaultProps, {commands: defaultCommands[props.packageManager]});
        }

        return defaultsDeep(cloneDeep(props), defaultProps) as ResolvedApplicationProps;
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
