# Connecting repositories

## Context

CI setup involves both AWS CodePipeline (main pipeline)
and CodeBuild (feature branch build) connecting to a Git repository.
In most cases, this is an external repository hosted on GitHub, Bitbucket, etc.

AWS provides built-in integrations for connecting GitHub, GitLab, Bitbucket,
and similar repositories to both AWS CodeBuild and AWS CodePipeline as sources.

However, there are multiple drawbacks of those integrations:

1. Integration methods are, in some cases, different for CodeBuild and CodePipeline,
   requiring different setups.
2. Integration methods are different for different providers.
3. When connecting AWS CodePipeline to Bitbucket you can't limit it access
   to a single repository only.
4. Built-in integration methods have limitations. For example, you can't setup
   a CodeBuild job triggered by a GitHub branch removal event.

Those reasons make setting up an external repository that would be used as a source
for both CodePipeline and CodeBuild in a universal way complicated.

## Decision

To streamline connecting repositories and be able to setup the projects
in a uniform way no matter where the repository is hosted,
the CI creates an AWS CodeCommit repository to act as a source.

Then, the CI creates a webhook in the source repository that triggers
a CodeBuild job that syncs the source repository with the CodeCommit.

## Consequences

1. Uniform way of setting up CodeBuild and CodePipeline jobs.
2. Additional latency before starting the build.
