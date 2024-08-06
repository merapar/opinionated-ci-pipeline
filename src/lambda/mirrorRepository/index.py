import os
import subprocess
import boto3
import time
import shutil

secret = os.environ["SECRET"]
sourceRepoTokenParam = os.environ["SOURCE_REPO_TOKEN_PARAM"]
sourceRepoDomain = os.environ["SOURCE_REPO_DOMAIN"]
sourceRepoName = os.environ["SOURCE_REPO_NAME"]
bucketName = os.environ["BUCKET_NAME"]

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

    shutil.make_archive("/tmp/repository-mirror.zip", "zip", "/tmp/repository")

    boto3.client('s3').upload_file("/tmp/repository-mirror.zip", bucketName, "repository-mirror.zip")

    return {
        "statusCode": 202,
    }
