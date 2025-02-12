from abc import ABC, abstractmethod
import json


class WebhookParser(ABC):

    @staticmethod
    def parse(source_repo_host, body):
        match source_repo_host:
            case "github":
                return GitHubWebhookParser(body)
            case "bitbucket":
                return BitbucketWebhookParser(body)
            case "gitlab":
                return GitlabWebhookParser(body)
            case _:
                raise Exception("Unknown source repository host")

    @staticmethod
    def _skip_ci(message):
        return any(tag in message for tag in ["[skip ci]", "[ci skip]", "[no ci]", "[skip-ci]", "[ci-skip]", "[no-ci]"])

    def __init__(self, body):
        self.body = json.loads(body)

    @abstractmethod
    def is_commit_or_branch_event():
        pass

    @abstractmethod
    def get_branch_name():
        pass

    @abstractmethod
    def is_branch_deleted():
        pass

    @abstractmethod
    def get_commit_sha():
        pass


class GitHubWebhookParser(WebhookParser):
    def __init__(self, body):
        super().__init__(body)

    def is_commit_or_branch_event(self):
        return self.body['ref'].startswith("refs/heads/")

    def get_branch_name(self):
        return self.body['ref'].removeprefix("refs/heads/")

    def is_branch_deleted(self):
        return self.body['deleted']

    def get_commit_sha(self):
        commits = [commit['id'] for commit in self.body['commits'] if not WebhookParser._skip_ci(commit['message'])]
        if commits:
            return commits[-1]
        if self.body['after'] != "0000000000000000000000000000000000000000":
            return self.body['after']
        return ''


class BitbucketWebhookParser(WebhookParser):
    def __init__(self, body):
        super().__init__(body)

    def is_commit_or_branch_event(self):
        return any((change['new'] and change['new']['type'] == "branch") or change['closed'] == True for change in self.body['push']['changes'])

    def get_branch_name(self):
        try:
            return next(change['new']['name'] for change in self.body['push']['changes'] if change['new'] and change['new']['type'] == "branch")
        except StopIteration:
            return next(change['old']['name'] for change in self.body['push']['changes'] if change['closed'] == True)

    def is_branch_deleted(self):
        return any(change['closed'] == True for change in self.body['push']['changes'])

    def get_commit_sha(self):
        try:
            commits = next(change['commits'] for change in self.body['push']['changes'] if change['new'] and change['new']['type'] == "branch")
            return next(commit['hash'] for commit in commits if not WebhookParser._skip_ci(commit['message']))
        except StopIteration:
            return ''

class GitlabWebhookParser(WebhookParser):
    def __init__(self, body):
        super().__init__(body)

    def is_commit_or_branch_event(self):
        return self.body['ref'].startswith("refs/heads/")

    def get_branch_name(self):
        return self.body['ref'].removeprefix("refs/heads/")

    def is_branch_deleted(self):
        branch_deleted_sha = "0000000000000000000000000000000000000000"
        return (
            self.body['after'] == branch_deleted_sha or 
            self.body['checkout_sha'] is None or 
            'deleted' in self.body['ref']
        )
    def get_commit_sha(self):
        commits = [commit['id'] for commit in self.body['commits'] if not WebhookParser._skip_ci(commit['message'])]
        if commits:
            return commits[-1]
        if self.body['after'] != "0000000000000000000000000000000000000000":
            return self.body['after']
        return ''
