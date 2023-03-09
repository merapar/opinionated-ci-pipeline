import {bitbucketApiCall, githubApiCall} from '../shared/api';
import {Logger} from '@aws-lambda-powertools/logger';

const logger = new Logger();

export const deleteWebhook = async (repositoryHost: string, repositoryToken: string, repositoryName: string, webhookId: string) => {
    switch (repositoryHost.toLowerCase()) {
    case 'github':
        return deleteGitHubWebhook(repositoryToken, repositoryName, webhookId);
    case 'bitbucket':
        return deleteBitbucketWebhook(repositoryToken, repositoryName, webhookId);
    default:
        throw new Error(`Unsupported repository host: ${repositoryHost}`);
    }
};

const deleteGitHubWebhook = async (repositoryToken: string, repositoryName: string, webhookId: string) => {
    const response = await githubApiCall(repositoryToken, `repos/${repositoryName}/hooks/${webhookId}`, 'DELETE');

    if (response.status === 204) {
        logger.info('Webhook deleted', {webhookId});
    } else if (response.status == 404) {
        logger.info('Webhook not found', {webhookId});
    } else {
        throw new Error(`Unable to delete GitHub webhook. Status: ${response.status}, response: ${await response.text()}`);
    }
};

const deleteBitbucketWebhook = async (repositoryToken: string, repositoryName: string, webhookId: string) => {
    const response = await bitbucketApiCall(repositoryToken, `repositories/${repositoryName}/hooks/${webhookId}`, 'DELETE');

    if (response.status === 204) {
        logger.info('Webhook deleted', {webhookId});
    } else if (response.status == 404) {
        logger.info('Webhook not found', {webhookId});
    } else {
        throw new Error(`Unable to delete Bitbucket webhook. Status: ${response.status}, response: ${await response.text()}`);
    }
};
