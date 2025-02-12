// types for Fetch API in Node 18
// this file and undici library dependency
// can be removed when types are added to @types/node
// (https://github.com/DefinitelyTyped/DefinitelyTyped/issues/60924)
declare global {
    export const {
        fetch,
        FormData,
        Headers,
        Request,
        Response,
    }: typeof import('undici');
}

export const githubApiCall = async (token: string, path: string, method: string, body?: object) => {
    return await fetch(`https://api.github.com/${path}`, {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
};

export const bitbucketApiCall = async (token: string, path: string, method: string, body?: object) => {
    return await fetch(`https://api.bitbucket.org/2.0/${path}`, {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
};

export const gitlabApiCall = async (token: string, path: string, method: string, body?: object) => {
    return await fetch(`https://gitlab.com/api/v4/${path}`, {
        method,
        headers: {
            'PRIVATE-TOKEN': token,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
};
