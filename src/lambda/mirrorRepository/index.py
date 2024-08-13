import os
import subprocess
import boto3
import time
import shutil
import json
from webhook_parser import WebhookParser

secret = os.environ["SECRET"]
source_repo_token_param = os.environ["SOURCE_REPO_TOKEN_PARAM"]
source_repo_host = os.environ["SOURCE_REPO_HOST"]
source_repo_domain = os.environ["SOURCE_REPO_DOMAIN"]
source_repo_name = os.environ["SOURCE_REPO_NAME"]
bucket_name = os.environ["BUCKET_NAME"]
default_branch_name = os.environ["DEFAULT_BRANCH_NAME"]
main_pipeline_name = os.environ["MAIN_PIPELINE_NAME"]
branch_deploy_project_name = os.environ["BRANCH_DEPLOY_PROJECT_NAME"]
branch_destroy_project_name = os.environ["BRANCH_DESTROY_PROJECT_NAME"]

feature_branch_prefixes = os.environ["FEATURE_BRANCH_PREFIXES"]
feature_branch_prefixes = feature_branch_prefixes.split(",") if feature_branch_prefixes != "" else []

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
        print("Missing body")
        return {
            "statusCode": 400,
            "body": "Missing body",
        }

    print(event['body'])
    parser = WebhookParser.parse(source_repo_host, event['body'])

    if not parser.is_commit_or_branch_event():
        print("Not a commit or branch event, ignoring")
        return {
            "statusCode": 202,
            "body": "Not a commit or branch event, ignoring",
        }

    branch_name = parser.get_branch_name()
    commit_sha = parser.get_commit_sha()
    branch_deleted = parser.is_branch_deleted()

    if not commit_sha and not branch_deleted:
        print("Failed to resolve commit SHA, ignoring")
        return {
            "statusCode": 202,
            "body": "Failed to resolve commit SHA, ignoring",
        }

    if len(feature_branch_prefixes) > 0 and branch_name != default_branch_name and not branch_name.startswith(tuple(feature_branch_prefixes)):
        print("Feature branch not matching allowed prefix, ignoring")
        return {
            "statusCode": 202,
            "body": "Feature branch not matching allowed prefix, ignoring",
        }

    version_id = ''
    if not branch_deleted:
        print("Copying repository")
        version_id = copy_repository(commit_sha)

    if branch_name == default_branch_name:
        print("Starting main pipeline execution")
        boto3.client('codepipeline').start_pipeline_execution(
            name=main_pipeline_name,
        )
    else:
        project_name = branch_destroy_project_name if branch_deleted else branch_deploy_project_name
        print(f"Starting {project_name} build")
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

    if commit_sha:
        subprocess.run(
            f"git update-ref HEAD {commit_sha}",
            cwd="/tmp/repository",
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
