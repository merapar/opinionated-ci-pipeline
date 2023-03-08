export {};

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
