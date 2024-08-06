/**
 * The repository mirror is packed as a zip file on an S3 bucket.
 * The zip file is automatically unpacked by the CodePipeline source action.
 * Then we need to checkout the repository to unpack it from the Git mirror files.
 */
export const checkoutCommands = [
    'cd ..',
    'git clone src repository',
    'cd repository',
];
