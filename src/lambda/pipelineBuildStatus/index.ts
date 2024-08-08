import {CodePipelineCloudWatchPipelineHandler} from 'aws-lambda/trigger/codepipeline-cloudwatch-pipeline';
import {Logger} from '@aws-lambda-powertools/logger';
import {CodePipelineClient, GetPipelineExecutionCommand} from '@aws-sdk/client-codepipeline';
import {transformStatusName} from '../shared/transformStatusName';
import {getSSMParameter} from '../shared/ssm';
import {sendCommitStatus} from '../shared/commitStatus';
import {HeadObjectCommand, S3Client} from '@aws-sdk/client-s3';

const REPOSITORY_HOST = process.env.REPOSITORY_HOST || '';
const REPOSITORY_NAME = process.env.REPOSITORY_NAME || '';
const REPOSITORY_TOKEN_PARAM_NAME = process.env.REPOSITORY_TOKEN_PARAM_NAME || '';
const REGION = process.env.AWS_REGION || '';
const SOURCE_BUCKET_NAME = process.env.SOURCE_BUCKET_NAME || '';

const logger = new Logger();

const codePipeline = new CodePipelineClient({});
const s3 = new S3Client({});

export const handler: CodePipelineCloudWatchPipelineHandler = async (event) => {
    logger.info('Event', {event});

    const {pipeline: pipelineName, 'execution-id': pipelineExecutionId} = event.detail;

    const status = transformStatusName(REPOSITORY_HOST, event.detail.state);
    if (!status) {
        logger.warn('Ignoring unsupported state change');
        return;
    }

    const execution = await codePipeline.send(new GetPipelineExecutionCommand({
        pipelineName,
        pipelineExecutionId,
    }));

    const mirrorVersion = execution.pipelineExecution?.artifactRevisions?.[0]?.revisionId;
    if (!mirrorVersion) {
        logger.warn('Repository mirror zip file version not found', {execution});
        return;
    }

    const head = await s3.send(
        new HeadObjectCommand({
            Bucket: SOURCE_BUCKET_NAME,
            Key: 'repository-mirror.zip',
            VersionId: mirrorVersion,
        }),
    );
    const commitSha = head.Metadata?.['commit-sha'];
    if (!commitSha) {
        logger.warn('Commit SHA not found in repository mirror metadata', {head});
        return;
    }

    const repositoryToken = await getSSMParameter(REPOSITORY_TOKEN_PARAM_NAME);

    const buildUrl = `https://${REGION}.console.aws.amazon.com/codesuite/codepipeline/pipelines/${pipelineName}/executions/${pipelineExecutionId}`;
    await sendCommitStatus(REPOSITORY_HOST, REPOSITORY_NAME, repositoryToken, status, commitSha, pipelineName, buildUrl, 'AWS CodePipeline');
};
