import {ApplicationProps, ResolvedApplicationProps} from '../applicationProps';
import {Construct} from 'constructs';
import {IStringParameter} from 'aws-cdk-lib/aws-ssm';
import {CustomResource, Duration, Fn, RemovalPolicy, Stack} from 'aws-cdk-lib';
import {CustomNodejsFunction} from './customNodejsFunction';
import {Code, Function as LambdaFunction, FunctionUrlAuthType, LayerVersion, Runtime} from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import {Provider} from 'aws-cdk-lib/custom-resources';
import {RetentionDays} from 'aws-cdk-lib/aws-logs';
import {AwsCliLayer} from 'aws-cdk-lib/lambda-layer-awscli';
import {PolicyStatement} from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';

export interface MirrorRepositoryProps extends Pick<ResolvedApplicationProps, 'repository'> {
    repoTokenParam: IStringParameter;
}

export class MirrorRepository extends Construct {

    readonly sourceBucket: s3.IBucket;

    constructor(scope: Construct, id: string, props: MirrorRepositoryProps) {
        super(scope, id);

        const webhookSecret = Fn.select(2, Fn.split('/', Stack.of(this).stackId));

        this.sourceBucket = new s3.Bucket(this, 'SourceBucket', {
            enforceSSL: true,
            removalPolicy: RemovalPolicy.DESTROY,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            lifecycleRules: [
                {
                    id: 'ExpireOldVersions',
                    noncurrentVersionExpiration: Duration.days(30),
                    noncurrentVersionsToRetain: 20,
                },
            ],
        });

        const {
            triggerMirrorFunctionUrl,
        } = this.createRepositoryMirroring(webhookSecret, props.repoTokenParam, props.repository, this.sourceBucket);

        this.createWebhook(props.repoTokenParam, props.repository, triggerMirrorFunctionUrl);
    }

    private createRepositoryMirroring(
        webhookSecret: string,
        repoTokenParam: IStringParameter,
        repository: ApplicationProps['repository'],
        bucket: s3.IBucket,
    ) {
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
                BUCKET_NAME: bucket.bucketName,
                SOURCE_REPO_DOMAIN: sourceRepositoryDomain,
                SOURCE_REPO_HOST: repository.host,
                SOURCE_REPO_NAME: repository.name,
                SOURCE_REPO_TOKEN_PARAM: repoTokenParam.parameterName,
                DEFAULT_BRANCH_NAME: repository.defaultBranch || '',
                MAIN_PIPELINE_NAME: Stack.of(this).stackName,
                BRANCH_DEPLOY_PROJECT_NAME: `${Stack.of(this).stackName}-featureBranch-deploy`,
                BRANCH_DESTROY_PROJECT_NAME: `${Stack.of(this).stackName}-featureBranch-destroy`,
            },
            initialPolicy: [
                new PolicyStatement({
                    actions: ['codepipeline:StartPipelineExecution'],
                    resources: [`arn:aws:codepipeline:${Stack.of(this).region}:${Stack.of(this).account}:${Stack.of(this).stackName}`],
                }),
                new PolicyStatement({
                    actions: ['codebuild:StartBuild'],
                    resources: [`arn:aws:codebuild:${Stack.of(this).region}:${Stack.of(this).account}:project/${Stack.of(this).stackName}-featureBranch-*`],
                }),
            ],
        });

        mirrorFunction.addLayers(
            new AwsCliLayer(this, 'AwsCliLayer'),
            LayerVersion.fromLayerVersionArn(this, 'GitLayer', `arn:aws:lambda:${Stack.of(this).region}:553035198032:layer:git-lambda2:8`),
        );

        bucket.grantWrite(mirrorFunction);
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
}
