import {ApplicationProps, ResolvedApplicationProps} from '../applicationProps';
import {Repository} from 'aws-cdk-lib/aws-codecommit';
import {Construct} from 'constructs';
import {IStringParameter} from 'aws-cdk-lib/aws-ssm';
import {getProjectName} from '../util/context';
import {CustomResource, Duration, Fn, Stack} from 'aws-cdk-lib';
import {CustomNodejsFunction} from './customNodejsFunction';
import {Code, Function as LambdaFunction, FunctionUrlAuthType, LayerVersion, Runtime} from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import {AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId, Provider} from 'aws-cdk-lib/custom-resources';
import {RetentionDays} from 'aws-cdk-lib/aws-logs';
import {AwsCliLayer} from 'aws-cdk-lib/lambda-layer-awscli';

export interface MirrorRepositoryProps extends Pick<ResolvedApplicationProps, 'repository'> {
    repoTokenParam: IStringParameter;
}

export class MirrorRepository extends Construct {

    readonly codeCommitRepository: Repository;

    constructor(scope: Construct, id: string, props: MirrorRepositoryProps) {
        super(scope, id);

        const webhookSecret = Fn.select(2, Fn.split('/', Stack.of(this).stackId));

        this.codeCommitRepository = this.createCodeCommitRepository();

        const {
            mirrorFunction,
            triggerMirrorFunctionUrl,
        } = this.createRepositoryMirroring(webhookSecret, props.repoTokenParam, props.repository, this.codeCommitRepository);

        this.createWebhook(props.repoTokenParam, props.repository, triggerMirrorFunctionUrl);

        this.triggerInitialMirror(mirrorFunction, webhookSecret);
    }

    private createCodeCommitRepository() {
        return new Repository(this, 'Repository', {
            repositoryName: getProjectName(this),
        });
    }

    private createRepositoryMirroring(webhookSecret: string, repoTokenParam: IStringParameter, repository: ApplicationProps['repository'], codeCommit: Repository) {
        const sourceRepositoryDomain = repository.host === 'github' ? 'github.com' : 'bitbucket.org';

        const mirrorFunction = new LambdaFunction(this, 'RepositoryMirroring', {
            runtime: Runtime.PYTHON_3_11, // AwsCliLayer requires Python function
            code: Code.fromAsset(path.join(__dirname, '..', 'lambda', 'mirrorRepository')),
            handler: 'index.handler',
            timeout: Duration.minutes(3),
            memorySize: 2048,
            environment: {
                HOME: '/var/task',
                SECRET: webhookSecret,
                CODECOMMIT_REPO_URL: codeCommit.repositoryCloneUrlHttp,
                SOURCE_REPO_DOMAIN: sourceRepositoryDomain,
                SOURCE_REPO_NAME: repository.name,
                SOURCE_REPO_TOKEN_PARAM: repoTokenParam.parameterName,
            },
        });

        mirrorFunction.addLayers(
            new AwsCliLayer(this, 'AwsCliLayer'),
            LayerVersion.fromLayerVersionArn(this, 'GitLayer', `arn:aws:lambda:${Stack.of(this).region}:553035198032:layer:git-lambda2:8`),
        );

        codeCommit.grantPullPush(mirrorFunction);
        repoTokenParam.grantRead(mirrorFunction);

        const triggerMirrorFunctionUrl = mirrorFunction.addFunctionUrl({
            authType: FunctionUrlAuthType.NONE,
        });

        return {
            mirrorFunction,
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

    private triggerInitialMirror(mirrorFunction: LambdaFunction, secret: string) {
        new AwsCustomResource(this, 'TriggerInitialMirror', {
            onCreate: {
                service: 'Lambda',
                action: 'invoke',
                parameters: {
                    invocationType: 'Event',
                    functionName: mirrorFunction.functionName,
                    payload: JSON.stringify({
                        queryStringParameters: {
                            secret,
                        },
                    }),
                },
                physicalResourceId: PhysicalResourceId.of('1'),
            },
            policy: AwsCustomResourcePolicy.fromSdkCalls({
                resources: [mirrorFunction.functionArn],
            }),
        });
    }
}
