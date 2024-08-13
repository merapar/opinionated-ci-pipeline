import unittest
from webhook_parser import WebhookParser

class TestWebhookParser(unittest.TestCase):

    def _assert_over_files(self, method, files):
        for filename, expected in files.items():
            with open(f"tests/{filename}") as f:
                parser = WebhookParser.parse(filename.split(".")[0], f.read())
                self.assertEqual(getattr(parser, method)(), expected, f"{filename}: {method}")

    def test_is_commit_or_branch_event(self):
        self._assert_over_files("is_commit_or_branch_event", {
            "bitbucket.main-commit.json": True,
            "bitbucket.main-multiple-commits.json": True,
            "bitbucket.branch-created.json": True,
            "bitbucket.branch-commit.json": True,
            "bitbucket.branch-removed.json": True,
            "bitbucket.tag-created.json": False,

            "github.main-commit.json": True,
            "github.main-multiple-commits.json": True,
            "github.branch-created.json": True,
            "github.branch-commit.json": True,
            "github.branch-removed.json": True,
        })

    def test_get_branch_name(self):
        self._assert_over_files("get_branch_name", {
            "bitbucket.main-commit.json": "main",
            "bitbucket.main-multiple-commits.json": "main",
            "bitbucket.branch-created.json": "test-1",
            "bitbucket.branch-commit.json": "test-1",
            "bitbucket.branch-removed.json": "test-1",

            "github.main-commit.json": "main",
            "github.main-multiple-commits.json": "main",
            "github.branch-created.json": "test-1",
            "github.branch-commit.json": "test-1",
            "github.branch-removed.json": "test-1",
        })

    def test_is_branch_deleted(self):
        self._assert_over_files("is_branch_deleted", {
            "bitbucket.main-commit.json": False,
            "bitbucket.main-multiple-commits.json": False,
            "bitbucket.branch-created.json": False,
            "bitbucket.branch-commit.json": False,
            "bitbucket.branch-removed.json": True,

            "github.main-commit.json": False,
            "github.main-multiple-commits.json": False,
            "github.branch-created.json": False,
            "github.branch-commit.json": False,
            "github.branch-removed.json": True,
        })

    def test_get_commit_sha(self):
        self._assert_over_files("get_commit_sha", {
            "bitbucket.main-commit.json": "48c72061eaea4e8cface6c2c3288b1b4b9862c53",
            "bitbucket.main-multiple-commits.json": "3c83a643e53b32fd0cfd773cfc73bda727059f84",
            "bitbucket.branch-created.json": "3c83a643e53b32fd0cfd773cfc73bda727059f84",
            "bitbucket.branch-commit.json": "84845155a76bf913f78ad7699c83efbd79937d89",
            "bitbucket.branch-removed.json": "",

            "github.main-commit.json": "50135ccbcf6832602e2901afc681354344dbfc7c",
            "github.main-multiple-commits.json": "19a9039d2346f90d05bc3b1031864ec478ea3224",
            "github.branch-created.json": "8610620cd9468e518cf629067d1429fa29173441",
            "github.branch-commit.json": "07c3bff71fb095e94b271efac1875fb6b5673ad6",
            "github.branch-removed.json": "",
        })

if __name__ == '__main__':
    unittest.main()
