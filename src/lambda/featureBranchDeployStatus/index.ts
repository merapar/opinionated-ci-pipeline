import {Logger} from '@aws-lambda-powertools/logger';
import {CodeBuildCloudWatchStateHandler} from 'aws-lambda';
import {transformStatusName} from '../shared/transformStatusName';
import {getSSMParameter} from '../shared/ssm';
import {sendCommitStatus} from '../shared/commitStatus';

const REPOSITORY_HOST = process.env.REPOSITORY_HOST || '';
const REPOSITORY_NAME = process.env.REPOSITORY_NAME || '';
const REPOSITORY_TOKEN_PARAM_NAME = process.env.REPOSITORY_TOKEN_PARAM_NAME || '';
const REGION = process.env.AWS_REGION || '';

const logger = new Logger();

export const handler: CodeBuildCloudWatchStateHandler = async (event) => {
    logger.info('Event', {event});

    const {'project-name': projectName, 'build-id': buildArn} = event.detail;
    const buildId = buildArn.split('/')[1];
    const commitSha = event.detail['additional-information']['source-version'];

    const status = transformStatusName(REPOSITORY_HOST, event.detail['build-status']);
    if (!status) {
        logger.warn('Ignoring unsupported status change');
        return;
    }

    const repositoryToken = await getSSMParameter(REPOSITORY_TOKEN_PARAM_NAME);

    const buildUrl = `https://${REGION}.console.aws.amazon.com/codesuite/codebuild/projects/${projectName}/build/${buildId}`;
    await sendCommitStatus(REPOSITORY_HOST, REPOSITORY_NAME, repositoryToken, status, commitSha, projectName, buildUrl, 'Feature branch deployment on AWS CodeBuild');
};
