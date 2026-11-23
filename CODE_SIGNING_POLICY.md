# Code Signing Policy

Free code signing for **TodoLite** is provided by [SignPath.io](https://signpath.io/), with certificates issued by the [SignPath Foundation](https://signpath.org/).

## What is Signed

This policy applies exclusively to official release artifacts built from our public source code repository: [`MenBoyBMN/TodoLite`](https://github.com/MenBoyBMN/TodoLite).

Specifically, the following binary is signed:

- `TodoLite.exe` — The official Windows x64 portable executable built from this repository.

No third-party binaries, closed-source components, or locally built executables are signed under this certificate.

## Build & Release Environment

- **CI/CD Platform:** All official release binaries are built exclusively on GitHub-hosted runners (`windows-latest`) via the public workflow [`.github/workflows/release.yml`](.github/workflows/release.yml).
- **Origin Verification:** Unsigned build artifacts are uploaded via GitHub Actions artifacts and submitted to SignPath for origin verification before signing.

## Team Roles & Access Control

- **Authors / Committers / Reviewers / Approvers:** [`@MenBoyBMN`](https://github.com/MenBoyBMN)
- **Security Practices:**
  - Multi-Factor Authentication (MFA) is enabled on all GitHub and SignPath accounts with repository write or signing permissions.
  - External contributions are reviewed via Pull Requests prior to merging.
  - Signing credentials and API tokens are stored exclusively in GitHub Actions Secrets and are never stored on local developer machines.

## Privacy Policy

TodoLite is a **100% offline** desktop application. It does not collect telemetry, track users, or transmit any user data to external servers. All user data is stored locally in `%APPDATA%\TodoLite\todolite.db`.
