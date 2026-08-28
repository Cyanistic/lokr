# Lokr Maintainer Deployment Plan

Status: Decisions confirmed; implementation pending
Owner: Cyan

This is a project-specific operations plan for bringing Cyan's Lokr instance back online. It is not a general self-hosting guide.

It is written for maintainers and future agent sessions working on this deployment.

## Goal

Run Lokr on Cyan's existing Ubuntu VPS as a Docker Compose stack managed by Komodo and exposed through Pangolin.

The deployment should make the following statement true:

> GitHub Actions deploys Lokr to Docker on an Ubuntu server.

The first deployment is manual. Automation comes only after the manual deployment works.

## Agreed decisions

- Use the existing VPS managed by Komodo.
- Target the Komodo Server named `production`.
- Use Komodo as the Docker orchestrator.
- Use Pangolin/Newt as the public edge and proxy.
- Keep SQLite. Do not migrate to Postgres for this redeployment.
- Keep the first deployment small. Do not add scaling or platform work without a concrete reason.
- Keep the full application data directory on a mounted volume.
- Copy application data off-box on a schedule after launch.
- Do not put secrets, private keys, or backup credentials in either repository.

These decisions replace the older direct-DNS, cloudflared, and systemd deployment path in the handoff.

## Repository ownership

### `Cyanistic/lokr`

Owns the application and how to build it:

- `Dockerfile`
- GitHub Actions workflow
- Rust backend
- React frontend

### `Cyanistic/docker-configs`

Owns the server and how to run the application:

- `services/lokr/docker-compose.yml`
- `komodo/stacks/lokr.toml`
- Pangolin route in `services/pangolin/blueprint.yaml`
- Backup job or backup configuration

The two repositories use the matching branch `deploy/lokr-komodo` during development.

## Proposed runtime shape

```text
GitHub Actions
  -> builds and publishes the Lokr image
  -> tells Komodo to deploy

Komodo
  -> runs the Compose stack on Server `production`

Pangolin/Newt
  -> forwards `lokr.cyanistic.com` to the Lokr host port

Lokr container
  -> listens on port 6969
  -> stores all application data in the mounted data directory
```

Pangolin already owns ports 80 and 443. Lokr must not claim those ports.

## Deployment automation decision

### Confirmed: GitHub Actions calls the Komodo API

1. GitHub Actions builds a Docker image from the Lokr repository.
2. It publishes the image to GHCR.
3. It calls Komodo's `DeployStack` API for the `lokr` stack.
4. Komodo pulls the image and runs the Compose stack on `production`.

The workflow uses `workflow_dispatch`, so Cyan chooses when a deployment happens. It has a `deploy` input. Run it with deployment disabled to publish the first image, then deploy that image manually through Komodo. Enable the input only after the manual deployment works. A push trigger can be added later if it is useful.

The workflow should use a Komodo service user with only the permissions needed for this stack. Store the Komodo URL, API key, and API secret in GitHub Actions secrets. Do not use SSH deployment keys.

Komodo API reference: <https://komo.do/docs/ecosystem/api>

### Simpler alternative: native GitHub webhook

Komodo can expose a Stack webhook such as:

```text
/listener/github/Stack/lokr/deploy
```

GitHub can call it directly on pushes. This removes the GitHub Actions deployment step, so it does not fit the LinkedIn wording as well. Use this only if the GitHub Actions requirement is relaxed.

Komodo webhook reference: <https://komo.do/docs/automate/webhooks>

### Decision

Use the Komodo API flow for the first implementation. Keep the native webhook as a possible future simplification, not as part of this deployment.

## Image strategy

The initial image strategy is confirmed as:

- GitHub Actions builds and publishes a stable deployment tag such as `main` to GHCR.
- Configure the Komodo Stack to pull before redeploying.
- Let the workflow trigger the Komodo deployment after the image push.

An immutable commit-SHA tag is safer for rollback, but it requires a second mechanism to tell the Compose stack which SHA to deploy. Do not add that complexity unless rollback requirements justify it.

The workflow builds both `linux/amd64` and `linux/arm64` images, so the VPS architecture does not need to be selected in advance.

## Data and storage

Lokr does not store everything in SQLite. The backend defines its data directory in `api/src/lib.rs` using the platform data directory and the package name `lokr-api`.

The mounted data directory must preserve:

- `api.db`
- `uploads/`
- `avatars/`

The Compose stack should make the container data path explicit instead of relying on an untracked container home directory. Verify the final path by starting the container and checking where these three items are created.

The existing infrastructure repository ignores service-local runtime data such as `services/lokr/.data/`. Do not commit that directory.

## Backup and recovery

The disaster recovery plan is an off-box copy of the complete Lokr data directory.

Backup scope:

- SQLite database files, including SQLite sidecar files when present.
- `uploads/`.
- `avatars/`.

The backup must use a SQLite-consistent method. A blind copy of a live WAL database may not be a valid restore. Prefer SQLite's backup mechanism or a brief controlled quiesce during the copy.

Still required before implementation:

- Backup destination.
- Schedule.
- Retention period.
- Encryption requirements.
- Restore procedure.

The backup is not complete until one backup can be read back and the restore steps are written down.

## Pangolin integration

Add a Pangolin public resource for the chosen Lokr domain. The existing blueprint pattern uses Newt to reach a host port through `host.docker.internal`.

Proposed route:

```text
lokr.cyanistic.com
  -> Pangolin/Newt
  -> host.docker.internal:6969
  -> Lokr container
```

The blueprint file is configuration input. It is not applied merely by committing the file. Applying the blueprint may require a Pangolin UI, CLI, or API action.

The confirmed public domain is `lokr.cyanistic.com`. Do not change DNS without Cyan's approval.

## Manual-first rollout

1. Build the Docker image locally.
2. Add the Compose stack and Komodo resource on the development branch.
3. Review the generated Compose configuration.
4. Merge or otherwise make the reviewed infrastructure configuration available to Komodo.
5. Run GitHub Actions with `deploy` set to `false` to publish the first image.
6. Deploy the `lokr` Stack manually through Komodo.
7. Confirm the container starts on `production`.
8. Apply the Pangolin blueprint change.
9. Confirm the public URL loads through Pangolin.
10. Test registration, login, upload, download, sharing, and anonymous upload.
11. Restart the stack and confirm data remains.
12. Configure and test the off-box backup.
13. Run GitHub Actions with `deploy` set to `true` and confirm the Komodo deployment result.

## Success criteria

- The Lokr container runs under Komodo on `production`.
- Pangolin serves the application over the chosen HTTPS domain.
- The frontend and API work from the same public origin.
- A file can be uploaded and downloaded after a container restart.
- User avatars survive a restart.
- The SQLite database survives a restart.
- An off-box backup contains the complete application data.
- The backup can be read back or restored using the documented procedure.
- A GitHub Actions run can trigger a Komodo deployment without SSH access.
- The dependency audit is reviewed and important browser-runtime vulnerabilities are addressed before public use.
- The deployment and public URL are rechecked before updating the profile claim.

## Open questions

- Is the Komodo Server `production` online and attached to the intended VPS?
- Is host port `6969` available?
- Should the GHCR image be public or private?
- Which dependency audit findings must be fixed before public use?
- What backup destination, schedule, retention, and encryption should be used?
- Who will apply the Pangolin blueprint and DNS change?

## Out of scope

- SQLite-to-Postgres migration.
- Horizontal scaling.
- Object storage migration.
- Reworking Lokr's encryption model.
- Reworking unrelated profile or minuit tasks.

## Follow-up records

After the deployment is live:

- Update `knowledge/evidence/lokr/EVIDENCE.md` in the minuit repository.
- Record that the runtime is Docker-managed.
- Record the actual public URL and deployment path.
- Tell the minuit session that the LinkedIn Lokr claim is now supported by the live deployment.
