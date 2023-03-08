import {SecretValue, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {cloneDeep, defaultsDeep, merge} from 'lodash';
import {ManagedPolicy} from 'aws-cdk-lib/aws-iam';
import {ApiDestination, Authorization, Connection, HttpMethod, HttpParameter} from 'aws-cdk-lib/aws-events';
import {FeatureBranchBuilds} from './constructs/featureBranchBuilds';
import {MainPipeline} from './constructs/mainPipeline';
import {assertUnreachable, notEmpty} from './util/types';
import {ApplicationProps, defaultProps, ResolvedApplicationProps} from './applicationProps';
import {SlackChannelConfiguration} from 'aws-cdk-lib/aws-chatbot';
import {Topic} from 'aws-cdk-lib/aws-sns';
import {NotificationsTopic} from './constructs/notificationsTopic';
import {getProjectName} from './util/context';
import {StringParameter} from 'aws-cdk-lib/aws-ssm';
import {MirrorRepository} from './constructs/mirrorRepository';

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

        const repoTokenParam = StringParameter.fromSecureStringParameterAttributes(this, 'RepositoryTokenParam', {
            parameterName: `/${getProjectName(this)}/ci/repositoryAccessToken`,
        });

        const mirror = new MirrorRepository(this, 'MirrorRepository', {
            repoTokenParam: repoTokenParam,
            repository: resolvedProps.repository,
        });

        const repositoryApiDestination = this.createRepositoryApiDestination(props.repository); // TODO Delete

        const mainPipeline = new MainPipeline(this, 'MainPipeline', {
            ...resolvedProps,
            codeCommitRepository: mirror.codeCommitRepository,
            repositoryApiDestination,
        });

        const featureBranchBuilds = new FeatureBranchBuilds(this, 'FeatureBranchBuilds', {
            ...resolvedProps,
            codeCommitRepository: mirror.codeCommitRepository,
            repositoryApiDestination,
        });

        if (resolvedProps.slackNotifications.workspaceId && resolvedProps.slackNotifications.channelId) {
            this.createSlackNotifications(projectName, resolvedProps.slackNotifications, mainPipeline.failuresTopic, featureBranchBuilds.failuresTopic);
        }
    }

    private resolveProps(props: ApplicationProps): ResolvedApplicationProps {
        if (props.packageManager) {
            merge(defaultProps, {commands: defaultCommands[props.packageManager]});
        }

        return defaultsDeep(cloneDeep(props), defaultProps) as ResolvedApplicationProps;
    }

    private createRepositoryApiDestination(repository: ApplicationProps['repository']): ApiDestination {
        const projectName = getProjectName(this);

        switch (repository.host) {
        case 'github':
            return new ApiDestination(this, 'GitHubDestination', {
                connection: new Connection(this, 'GitHubConnection', {
                    authorization: Authorization.apiKey(
                        'Authorization',
                        SecretValue.secretsManager(`/${projectName}/githubAuthorization`, {jsonField: 'header'}),
                    ),
                    description: 'GitHub repository connection',
                    headerParameters: {
                        'Accept': HttpParameter.fromString('application/vnd.github+json'),
                        'X-GitHub-Api-Version': HttpParameter.fromString('2022-11-28'),
                    },
                }),
                endpoint: `https://api.github.com/repos/${repository.name}/statuses/*`,
                httpMethod: HttpMethod.POST,
            });
        case 'bitbucket':
            return new ApiDestination(this, 'BitbucketDestination', {
                connection: new Connection(this, 'BitbucketConnection', {
                    authorization: Authorization.apiKey(
                        'Authorization',
                        SecretValue.secretsManager(`/${projectName}/bitbucketAuthorization`, {jsonField: 'header'}),
                    ),
                    description: 'Bitbucket repository connection',
                }),
                endpoint: `https://api.bitbucket.org/2.0/repositories/${repository.name}/commit/*/statuses/build`,
                httpMethod: HttpMethod.POST,
            });
        default:
            return assertUnreachable(repository.host);
        }
    }

    private createSlackNotifications(
        projectName: string, config: ResolvedApplicationProps['slackNotifications'],
        mainPipelineFailuresTopic: Topic, featureBranchFailuresTopic: Topic,
    ) {
        const alarmsTopic = new NotificationsTopic(this, 'SlackAlarmsTopic', {
            projectName: projectName,
            notificationName: 'slackAlarms',
        });

        const slack = new SlackChannelConfiguration(this, 'SlackChannelConfiguration', {
            slackChannelConfigurationName: this.stackName,
            slackWorkspaceId: config.workspaceId,
            slackChannelId: config.channelId,
            notificationTopics: [
                alarmsTopic.topic,
                config.mainPipelineFailures ? mainPipelineFailuresTopic : undefined,
                config.featureBranchFailures ? featureBranchFailuresTopic : undefined,
            ].filter(notEmpty),
        });
        slack.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('CloudWatchReadOnlyAccess'));
    }
}
