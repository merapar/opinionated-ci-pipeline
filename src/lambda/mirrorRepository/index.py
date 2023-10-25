import os
import subprocess
import boto3

secret = os.environ["SECRET"]
sourceRepoTokenParam = os.environ["SOURCE_REPO_TOKEN_PARAM"]
sourceRepoDomain = os.environ["SOURCE_REPO_DOMAIN"]
sourceRepoName = os.environ["SOURCE_REPO_NAME"]
codeCommitRepoUrl = os.environ["CODECOMMIT_REPO_URL"]

sourceRepoToken = boto3.client('ssm').get_parameter(
    Name=sourceRepoTokenParam,
    WithDecryption=True,
)["Parameter"]["Value"]

def handler(event, context):
    if (event.get("queryStringParameters") is None or event.get("queryStringParameters").get("secret") != secret):
        print("Invalid secret")
        return {
            "statusCode": 401,
            "body": "Invalid secret",
        }

    subprocess.run(
        "rm -rf *",
        cwd="/tmp",
        shell=True, check=True, text=True
    )

    subprocess.run(
        f"git clone --mirror https://x-token-auth:{sourceRepoToken}@{sourceRepoDomain}/{sourceRepoName}.git repository",
        cwd="/tmp",
        shell=True, check=True, text=True
    )

    subprocess.run(
        f"git push --mirror {codeCommitRepoUrl}",
        cwd="/tmp/repository",
        shell=True, check=True, text=True
    )

    return {
        "statusCode": 202,
    }
