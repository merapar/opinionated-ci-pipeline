import {ApplicationProps, ResolvedApplicationProps} from '../applicationProps';
import {Repository} from 'aws-cdk-lib/aws-codecommit';
import {Construct} from 'constructs';
import {IStringParameter} from 'aws-cdk-lib/aws-ssm';
import {getProjectName} from '../util/context';
import {BuildEnvironmentVariableType, BuildSpec, ComputeType, LinuxBuildImage, Project} from 'aws-cdk-lib/aws-codebuild';
import {CustomResource, Duration, Stack} from 'aws-cdk-lib';
import {CustomNodejsFunction} from './customNodejsFunction';
import {Code, Function as LambdaFunction, FunctionUrlAuthType} from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import {PolicyStatement} from 'aws-cdk-lib/aws-iam';
import {Provider} from 'aws-cdk-lib/custom-resources';
import {RetentionDays} from 'aws-cdk-lib/aws-logs';
import {Trigger} from 'aws-cdk-lib/triggers';

export interface MirrorRepositoryProps extends Pick<ResolvedApplicationProps, 'repository'> {
    repoTokenParam: IStringParameter;
}

export class MirrorRepository extends Construct {

    readonly codeCommitRepository: Repository;

    constructor(scope: Construct, id: string, props: MirrorRepositoryProps) {
        super(scope, id);

        this.codeCommitRepository = this.createCodeCommitRepository();

        const {
            triggerMirrorFunction,
            triggerMirrorFunctionUrl,
        } = this.createRepositoryMirroring(props.repoTokenParam, props.repository, this.codeCommitRepository);

        const webhook = this.createWebhook(props.repoTokenParam, props.repository, triggerMirrorFunctionUrl.url);

        this.triggerInitialMirror(triggerMirrorFunction, [webhook]);
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

        const triggerMirrorFunction = new CustomNodejsFunction(this, 'TriggerMirrorFunction', {
            code: Code.fromAsset(path.join(__dirname, '..', 'lambda', 'mirrorRepository')),
            timeout: Duration.seconds(30),
            environment: {
                CODEBUILD_PROJECT_NAME: mirrorProject.projectName,
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
            triggerMirrorFunction,
            triggerMirrorFunctionUrl,
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

        return new CustomResource(this, 'Webhook', {
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

    private triggerInitialMirror(triggerMirrorRepoFunction: LambdaFunction, executeAfter: Construct[]) {
        new Trigger(this, 'TriggerInitialMirror', {
            handler: triggerMirrorRepoFunction,
            executeAfter,
            executeOnHandlerChange: false,
        });
    }
}
