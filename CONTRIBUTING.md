# Contributing to Photokin

Thank you for helping make photo organization simpler. You can contribute through
bug reports, ideas, documentation, design, or code; you do not need to be a
developer.

Please follow our [Code of Conduct](CODE_OF_CONDUCT.md). New to Photokin as a
user? The [user guide](https://enrique-lozano.github.io/Photokin/guide/) explains
how everything works.

## Report a bug or suggest a feature

1. Search [existing issues](https://github.com/enrique-lozano/Photokin/issues).
   If one matches, add a reaction or useful new details rather than a "+1" comment.
2. Open one issue per problem or proposal.
3. For a bug, describe the steps, expected and actual behavior, app version, OS,
   and relevant file format. Include an error message when available.
4. For an idea, explain the problem you want to solve and an example workflow.
   Large changes are best discussed in an issue before implementation.

### Share photo-related information safely

Photos may contain GPS coordinates, names, camera serial numbers, and face
regions even when those details are not visible. Logs and screenshots can expose
personal paths, people, and locations too.

- Prefer synthetic or public-domain samples and test with copies.
- Inspect and sanitize metadata before attaching files.
- Redact private details in logs and screenshots.
- Only share photos you have permission to publish. Do not upload your private
  library to reproduce a problem.

If sanitizing removes the bug, explain that in the issue instead of posting
sensitive originals. See [Photo safety](docs/PHOTO_SAFETY.md).

## Improve documentation or design

Help us make the app understandable both to casual users and to photographers
who need precise metadata controls. Suggest plain-language wording, explain a
confusing workflow, fix documentation, or share a UI mockup in an issue. The
user guide lives in [`website/guide/`](website/guide/); every page has a
"Suggest a change to this page" link.

The README and website screenshots are generated from a demo library of
public-domain photos; see [Screenshots](screenshots/README.md). For other
documentation images, use a separate test library with licensed,
non-sensitive images. Hide personal paths, GPS details, and face names. Capture
the current UI, check both the image and its metadata, and include meaningful
alternative text. Do not present mockups as released features.

## Contribute code

Start with the [developer guide](docs/CODE_CONTRIBUTING.md) and
[local setup instructions](docs/RUN_THE_CODE_LOCALLY.md). Small, focused fixes can
be submitted directly; discuss larger behavioral changes first.

Before opening a PR, run the checks appropriate to your change in the
[testing guide](docs/TESTING.md), explain what changed, and report exact commands
and results. Mention anything you could not verify.

> By submitting a contribution, including documentation or designs, you agree
> to the [Contributor License Agreement](CLA.md). This allows the maintainer to
> offer Photokin under both AGPL-3.0 and commercial terms. You retain ownership
> of your contribution.

## Support the project

You can also [support development with a donation](README.md#support-the-project-).
Donations are optional; useful reports, documentation, and thoughtful feedback
matter just as much.

Thank you for contributing!
