# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [2.1.0-beta.0](https://github.com/merapar/opinionated-ci-pipeline/compare/v2.0.1...v2.1.0-beta.0) (2024-02-27)


### Features

* add possibility to enable manual approval before deploying on environment. Solves issue [#5](https://github.com/merapar/opinionated-ci-pipeline/issues/5) ([73b895f](https://github.com/merapar/opinionated-ci-pipeline/commit/73b895f50b264286121235c863c1b8bcee1a61f9))
* support separate Slack channels for main pipeline and feature deployments ([afd68f5](https://github.com/merapar/opinionated-ci-pipeline/commit/afd68f50986b905ffbd859663d871afb1b57e12e))


### Bug Fixes

* add prefix to the identifier of ci stack ([48498d6](https://github.com/merapar/opinionated-ci-pipeline/commit/48498d675ab6bbfa009ae864bc6f655fd23dadc4))
* bitbucket build status key dependent on build name ([fbcc937](https://github.com/merapar/opinionated-ci-pipeline/commit/fbcc9370a4696989c131d5c42fe3be76926bfb24))

### [2.0.1](https://github.com/merapar/opinionated-ci-pipeline/compare/v2.0.0...v2.0.1) (2023-10-31)


### Bug Fixes

* initial mirror trigger params on CI create ([1377fdf](https://github.com/merapar/opinionated-ci-pipeline/commit/1377fdf21f2ea675c975f90b23b4c29aaf1db1a3))
* unique CodeStar notification rule names ([091e30f](https://github.com/merapar/opinionated-ci-pipeline/commit/091e30f881752aa2fcb99b5c87c6513991c7f00f))

## [2.0.0](https://github.com/merapar/opinionated-ci-pipeline/compare/v2.0.0-beta.2...v2.0.0) (2023-10-25)

### ⚠ BREAKING CHANGES

* use Standard 7.0 as default build image

### Features

* use Standard 7.0 as default build image ([4cba689](https://github.com/merapar/opinionated-ci-pipeline/commit/4cba689c0143a9939791ebb125d60b6d09a8aef6))
* replace CodeBuild with Lambda for repository mirroring ([1356115](https://github.com/merapar/opinionated-ci-pipeline/commit/1356115764c4741581e8cc0207d338fb83826eb6))

## [1.1.0](https://github.com/merapar/opinionated-ci-pipeline/compare/v1.1.0-beta.1...v1.1.0) (2023-07-25)

## [1.1.0-beta.1](https://github.com/merapar/opinionated-ci-pipeline/compare/v1.1.0-beta.0...v1.1.0-beta.1) (2023-07-25)


### Bug Fixes

* use CodeStar Notifications for proper Slack notifications ([9e7b08a](https://github.com/merapar/opinionated-ci-pipeline/commit/9e7b08a11fc472093436633f070402c29b614078))

## [1.1.0-beta.0](https://github.com/merapar/opinionated-ci-pipeline/compare/v1.0.0...v1.1.0-beta.0) (2023-04-04)


### Features

* apply all supported CodeBuild overrides to feature branch builds ([b3143b5](https://github.com/merapar/opinionated-ci-pipeline/commit/b3143b5ad536b0b944d7e4d1cf08d97d163ce6ab))

## [1.0.0](https://github.com/merapar/opinionated-ci-pipeline/compare/v1.0.0-beta.2...v1.0.0) (2023-03-17)


### Bug Fixes

* trigger initial repository mirroring ([90b51cc](https://github.com/merapar/opinionated-ci-pipeline/commit/90b51ccf476a452c2b6bfbfd3853841382f24870))

## [1.0.0-beta.2](https://github.com/merapar/opinionated-ci-pipeline/compare/v1.0.0-beta.1...v1.0.0-beta.2) (2023-03-09)


### Features

* sync repo by webhooks ([0c7dafc](https://github.com/merapar/opinionated-ci-pipeline/commit/0c7dafcf6a6601304227d1a466c3f83b9c5925f2))

## 1.0.0-beta.1 (2023-03-06)


### ⚠ BREAKING CHANGES

* move project name to CDK context parameters ([78fe340](https://github.com/merapar/opinionated-ci-pipeline/commit/78fe3408bbbbf1eab221f7791801cf17aaeb71e0))

### 1.0.0-beta.0 (2023-02-28)

Initial version
