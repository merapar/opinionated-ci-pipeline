import {ApplicationProps, ResolvedApplicationProps} from '../applicationProps';
import {Repository} from 'aws-cdk-lib/aws-codecommit';
import {Construct} from 'constructs';
import {IStringParameter} from 'aws-cdk-lib/aws-ssm';
import {getProjectName} from '../util/context';
import {BuildEnvironmentVariableType, BuildSpec, ComputeType, LinuxBuildImage, Project} from 'aws-cdk-lib/aws-codebuild';
import {CustomResource, Duration, Fn, Stack} from 'aws-cdk-lib';
import {CustomNodejsFunction} from './customNodejsFunction';
import {Code, FunctionUrlAuthType} from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import {PolicyStatement} from 'aws-cdk-lib/aws-iam';
import {AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId, Provider} from 'aws-cdk-lib/custom-resources';
import {RetentionDays} from 'aws-cdk-lib/aws-logs';

export interface MirrorRepositoryProps extends Pick<ResolvedApplicationProps, 'repository'> {
    repoTokenParam: IStringParameter;
}

export class MirrorRepository extends Construct {

    readonly codeCommitRepository: Repository;

    constructor(scope: Construct, id: string, props: MirrorRepositoryProps) {
        super(scope, id);

        this.codeCommitRepository = this.createCodeCommitRepository();

        const {
            mirrorProject,
            triggerMirrorFunctionUrl,
        } = this.createRepositoryMirroring(props.repoTokenParam, props.repository, this.codeCommitRepository);

        this.createWebhook(props.repoTokenParam, props.repository, triggerMirrorFunctionUrl);

        this.triggerInitialMirror(mirrorProject);
    }

    private createCodeCommitRepository() {
        return new Repository(this, 'Repository', {
            repositoryName: getProjectName(this),
        });
    }

    private createRepositoryMirroring(repoTokenParam: IStringParameter, repository: ApplicationProps['repository'], codeCommit: Repository) {
        const sourceRepositoryDomain = repository.host === 'github' ? 'github.com' : 'bitbucket.org';
        const mirrorProject = new Project(this, 'RepositoryMirrorProject', {
            projectName: `${Stack.of(this).stackName}-mirrorRepository`,
            timeout: Duration.minutes(20),
            environment: {
                buildImage: LinuxBuildImage.STANDARD_6_0,
                computeType: ComputeType.SMALL,
            },
            environmentVariables: {
                REPO_TOKEN: {
                    type: BuildEnvironmentVariableType.PARAMETER_STORE,
                    value: repoTokenParam.parameterName,
                },
            },
            buildSpec: BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: [
                            'pip install git-remote-codecommit',
                        ],
                    },
                    build: {
                        commands: [
                            `git clone --mirror https://x-token-auth:$REPO_TOKEN@${sourceRepositoryDomain}/${repository.name}.git repository`,
                            'cd repository',
                            `git push --mirror ${codeCommit.repositoryCloneUrlGrc}`,
                        ],
                    },
                },
            }),
        });
        codeCommit.grantPullPush(mirrorProject);
        repoTokenParam.grantRead(mirrorProject);

        const webhookSecret = Fn.select(2, Fn.split('/', Stack.of(this).stackId));

        const triggerMirrorFunction = new CustomNodejsFunction(this, 'TriggerMirrorFunction', {
            code: Code.fromAsset(path.join(__dirname, '..', 'lambda', 'mirrorRepository')),
            timeout: Duration.seconds(30),
            environment: {
                CODEBUILD_PROJECT_NAME: mirrorProject.projectName,
                SECRET: webhookSecret,
            },
        });
        triggerMirrorFunction.addToRolePolicy(new PolicyStatement({
            actions: ['codebuild:StartBuild'],
            resources: [mirrorProject.projectArn],
        }));

        const triggerMirrorFunctionUrl = triggerMirrorFunction.addFunctionUrl({
            authType: FunctionUrlAuthType.NONE,
        });

        return {
            mirrorProject,
            triggerMirrorFunctionUrl: `${triggerMirrorFunctionUrl.url}?secret=${webhookSecret}`,
        };
    }

    private createWebhook(repoTokenParam: IStringParameter, repository: ApplicationProps['repository'], webhookUrl: string) {
        const setupWebhooksFunction = new CustomNodejsFunction(this, 'SetupWebhooksFunction', {
            code: Code.fromAsset(path.join(__dirname, '..', 'lambda', 'setupWebhooks')),
            timeout: Duration.seconds(30),
        });
        repoTokenParam.grantRead(setupWebhooksFunction);

        const provider = new Provider(this, 'WebhookProvider', {
            onEventHandler: setupWebhooksFunction,
            logRetention: RetentionDays.ONE_MONTH,
        });

        new CustomResource(this, 'Webhook', {
            serviceToken: provider.serviceToken,
            properties: {
                StackName: Stack.of(this).stackName,
                RepositoryHost: repository.host,
                RepositoryName: repository.name,
                RepositoryTokenParamName: repoTokenParam.parameterName,
                WebhookUrl: webhookUrl,
            },
        });
    }

    private triggerInitialMirror(mirrorProject: Project) {
        new AwsCustomResource(this, 'TriggerInitialMirror', {
            onCreate: {
                service: 'CodeBuild',
                action: 'startBuild',
                parameters: {
                    projectName: mirrorProject.projectName,
                },
                physicalResourceId: PhysicalResourceId.of('1'),
            },
            policy: AwsCustomResourcePolicy.fromSdkCalls({
                resources: [mirrorProject.projectArn],
            }),
        });
    }
}
