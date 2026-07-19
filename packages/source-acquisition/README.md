# `packages/source-acquisition`

Owner: `ytw010629`

YTW owns server-side uploaded-menu intake plus official website, PDF, ordering
page, and Web Search discovery adapters normalized into the shared menu-source
contract. It also owns bounded retrieval, URL and source validation,
provenance, and typed acquisition outcomes.

Discovery output is not canonical proof. This package does not render UI,
define culinary truth, persist canonical data, expose raw source URLs in logs
or public errors, or make a real provider call in automated tests.

The package manifest is frozen at `1.0.0`. Real implementation starts only
after U1.6 merges to `main` and is recorded `DONE`.

U1.5 public surface: `MenuSourceAcquisitionPort` and
`FakeMenuSourceAcquisitionPort`. This package isolates source discovery,
retrieval, and provenance from restaurant ranking and compact extraction. Its
U1.5 class is a deterministic fake only.
