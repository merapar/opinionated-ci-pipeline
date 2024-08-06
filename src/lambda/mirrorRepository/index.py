import os
import subprocess
import boto3
import time
import shutil
import json

secret = os.environ["SECRET"]
sourceRepoTokenParam = os.environ["SOURCE_REPO_TOKEN_PARAM"]
sourceRepoDomain = os.environ["SOURCE_REPO_DOMAIN"]
sourceRepoName = os.environ["SOURCE_REPO_NAME"]
bucketName = os.environ["BUCKET_NAME"]
defaultBranchName = os.environ["DEFAULT_BRANCH_NAME"]
mainPipelineName = os.environ["MAIN_PIPELINE_NAME"]
branchDeployProjectName = os.environ["BRANCH_DEPLOY_PROJECT_NAME"]
branchDestroyProjectName = os.environ["BRANCH_DESTROY_PROJECT_NAME"]

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

    if event.get("body") is None:
        return {
            "statusCode": 400,
            "body": "Missing body",
        }

    body = json.loads(event['body'])

    if not body.get("ref").startswith("refs/heads/"):
        return {
            "statusCode": 202,
            "body": "Not a commit or branch event, ignoring",
        }

    commit_sha = body.get("after")
    branch_deleted = body.get("deleted")

    version_id = ''
    if not branch_deleted:
        version_id = copy_repository(commit_sha)

    if body.get("ref") == f"refs/heads/{defaultBranchName}":
        boto3.client('codepipeline').start_pipeline_execution(
            name=mainPipelineName,
        )
    elif body.get("ref").startswith("refs/heads/"):
        branch_name = body.get("ref").removeprefix("refs/heads/")
        project_name = branchDestroyProjectName if body.get("deleted") else branchDeployProjectName

        boto3.client('codebuild').start_build(
            projectName=project_name,
            sourceVersion=version_id,
            environmentVariablesOverride=[
                {
                    'name': 'BRANCH_NAME',
                    'type': 'PLAINTEXT',
                    'value': branch_name,
                },
                {
                    'name': 'COMMIT_SHA',
                    'type': 'PLAINTEXT',
                    'value': commit_sha,
                },
            ],
        )

    return {
        "statusCode": 202,
    }


def copy_repository(commit_sha):
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

    shutil.make_archive("/tmp/repository-mirror", "zip", "/tmp/repository")

    put_response = boto3.client('s3').put_object(
        Bucket=bucketName,
        Key="repository-mirror.zip",
        Body=open("/tmp/repository-mirror.zip", "rb"),
        Metadata={
            "commit-sha": commit_sha,
        }
    )

    return put_response["VersionId"]
