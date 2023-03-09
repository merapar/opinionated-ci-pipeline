import {CodePipelineCloudWatchPipelineHandler} from 'aws-lambda/trigger/codepipeline-cloudwatch-pipeline';
import {Logger} from '@aws-lambda-powertools/logger';
import {CodePipelineClient, GetPipelineExecutionCommand} from '@aws-sdk/client-codepipeline';
import {transformStatusName} from '../shared/transformStatusName';
import {getSSMParameter} from '../shared/ssm';
import {sendCommitStatus} from '../shared/commitStatus';

const REPOSITORY_HOST = process.env.REPOSITORY_HOST || '';
const REPOSITORY_NAME = process.env.REPOSITORY_NAME || '';
const REPOSITORY_TOKEN_PARAM_NAME = process.env.REPOSITORY_TOKEN_PARAM_NAME || '';
const REGION = process.env.AWS_REGION || '';

const logger = new Logger();

const codePipeline = new CodePipelineClient({});

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

    const commitSha = execution.pipelineExecution?.artifactRevisions?.[0]?.revisionId;
    if (!commitSha) {
        logger.warn('Commit hash not found', {execution});
        return;
    }

    const repositoryToken = await getSSMParameter(REPOSITORY_TOKEN_PARAM_NAME);

    const buildUrl = `https://${REGION}.console.aws.amazon.com/codesuite/codepipeline/pipelines/${pipelineName}/executions/${pipelineExecutionId}`;
    await sendCommitStatus(REPOSITORY_HOST, REPOSITORY_NAME, repositoryToken, status, commitSha, pipelineName, buildUrl, 'AWS CodePipeline');
};
