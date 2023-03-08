/**
 * Transforms the build status from CodePipeline / CodeBuild
 * to the one accepted by the GitHub / Bitbucket for the commit status.
 */
export const transformStatusName = (repositoryType: string, status: string): string | null => {
    switch (repositoryType.toLowerCase()) {
    case 'github':
        return transformStatusNameForGitHub(status);
    case 'bitbucket':
        return transformStatusNameForBitbucket(status);
    default:
        return null;
    }
};

const transformStatusNameForGitHub = (status: string): string | null => {
    switch (status) {
    case 'STARTED': // CodePipeline
    case 'IN_PROGRESS': // CodeBuild
        return 'pending';
    case 'SUCCEEDED':
        return 'success';
    case 'FAILED':
        return 'failure';
    case 'STOPPED':
        return 'error';
    default:
        return null;
    }
};

const transformStatusNameForBitbucket = (status: string): string | null => {
    switch (status) {
    case 'STARTED': // CodePipeline
    case 'IN_PROGRESS': // CodeBuild
        return 'INPROGRESS';
    case 'SUCCEEDED':
        return 'SUCCESSFUL';
    case 'FAILED':
        return status;
    case 'STOPPED':
        return status;
    default:
        return null;
    }
};
