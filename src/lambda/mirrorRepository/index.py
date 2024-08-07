import os
import subprocess
import boto3
import time
import shutil
import json

secret = os.environ["SECRET"]
source_repo_token_param = os.environ["SOURCE_REPO_TOKEN_PARAM"]
source_repo_domain = os.environ["SOURCE_REPO_DOMAIN"]
source_repo_name = os.environ["SOURCE_REPO_NAME"]
bucket_name = os.environ["BUCKET_NAME"]
default_branch_name = os.environ["DEFAULT_BRANCH_NAME"]
main_pipeline_name = os.environ["MAIN_PIPELINE_NAME"]
branch_deploy_project_name = os.environ["BRANCH_DEPLOY_PROJECT_NAME"]
branch_destroy_project_name = os.environ["BRANCH_DESTROY_PROJECT_NAME"]

source_repo_token = boto3.client('ssm').get_parameter(
    Name=source_repo_token_param,
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

    if body.get("ref") == f"refs/heads/{default_branch_name}":
        boto3.client('codepipeline').start_pipeline_execution(
            name=main_pipeline_name,
        )
    elif body.get("ref").startswith("refs/heads/"):
        branch_name = body.get("ref").removeprefix("refs/heads/")
        project_name = branch_destroy_project_name if body.get("deleted") else branch_deploy_project_name

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
        f"git clone --mirror https://x-token-auth:{source_repo_token}@{source_repo_domain}/{source_repo_name}.git repository",
        cwd="/tmp",
        shell=True, check=True, text=True
    )

    shutil.make_archive("/tmp/repository-mirror", "zip", "/tmp/repository")

    put_response = boto3.client('s3').put_object(
        Bucket=bucket_name,
        Key="repository-mirror.zip",
        Body=open("/tmp/repository-mirror.zip", "rb"),
        Metadata={
            "commit-sha": commit_sha,
        }
    )

    return put_response["VersionId"]
