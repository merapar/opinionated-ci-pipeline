import {bitbucketApiCall, githubApiCall} from '../shared/api';

export const createWebhook = async (repositoryHost: string, repositoryToken: string, repositoryName: string, webhookUrl: string, description: string): Promise<string> => {
    switch (repositoryHost.toLowerCase()) {
    case 'github':
        return createGitHubWebhook(repositoryToken, repositoryName, webhookUrl);
    case 'bitbucket':
        return createBitbucketWebhook(repositoryToken, repositoryName, webhookUrl, description);
    default:
        throw new Error(`Unsupported repository host: ${repositoryHost}`);
    }
};

const createGitHubWebhook = async (repositoryToken: string, repositoryName: string, webhookUrl: string): Promise<string> => {
    const response = await githubApiCall(repositoryToken, `repos/${repositoryName}/hooks`, 'POST', {
        name: 'web',
        active: true,
        events: ['push'],
        config: {
            url: webhookUrl,
            content_type: 'json',
        },
    });

    if (response.status === 201) {
        return ((await response.json()) as Record<string, number>).id.toString();
    }

    throw new Error(`Unable to create GitHub webhook. Status: ${response.status}, response: ${await response.text()}`);
};

const createBitbucketWebhook = async (repositoryToken: string, repositoryName: string, webhookUrl: string, description: string): Promise<string> => {
    const response = await bitbucketApiCall(repositoryToken, `repositories/${repositoryName}/hooks`, 'POST', {
        description,
        url: webhookUrl,
        active: true,
        events: ['repo:push'],
    });

    if (response.status === 201) {
        return ((await response.json()) as Record<string, string>).uuid;
    }

    throw new Error(`Unable to create Bitbucket webhook. Status: ${response.status}, response: ${await response.text()}`);
};
