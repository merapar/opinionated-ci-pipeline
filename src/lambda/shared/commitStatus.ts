import {bitbucketApiCall, githubApiCall} from './api';

export const sendCommitStatus = async (
    repositoryHost: string, repositoryName: string, token: string,
    status: string, commitSha: string, buildName: string, buildUrl: string, description: string,
) => {
    switch (repositoryHost.toLowerCase()) {
    case 'github':
        return await sendGitHubCommitStatus(repositoryName, token, status, commitSha, buildName, buildUrl);
    case 'bitbucket':
        return await sendBitbucketCommitStatus(repositoryName, token, status, commitSha, buildName, buildUrl, description);
    default:
        throw new Error(`Unsupported repository host to send commit status to: ${repositoryHost}`);
    }
};

const sendGitHubCommitStatus = async (
    repositoryName: string, token: string,
    status: string, commitSha: string, buildName: string, buildUrl: string,
) => {
    const response = await githubApiCall(token, `repos/${repositoryName}/statuses/${commitSha}`, 'POST', {
        state: status,
        target_url: buildUrl,
        context: buildName,
    });
    if (response.status >= 300) {
        throw new Error(`Failed to send status to GitHub. Status: ${response.status}, response: ${await response.text()}`);
    }
};

const sendBitbucketCommitStatus = async (
    repositoryName: string, token: string,
    status: string, commitSha: string, buildName: string, buildUrl: string, description: string,
) => {
    const response = await bitbucketApiCall(token, `repositories/${repositoryName}/commit/${commitSha}/statuses/build`, 'POST', {
        key: 'AWS-PIPELINE-BUILD',
        state: status,
        name: buildName,
        description: description,
        url: buildUrl,
    });
    if (response.status >= 300) {
        throw new Error(`Failed to send status to Bitbucket. Status: ${response.status}, response: ${await response.text()}`);
    }
};
