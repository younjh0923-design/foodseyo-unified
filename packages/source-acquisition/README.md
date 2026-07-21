# `packages/source-acquisition`

Owner: `ytw010629`

YTW owns server-side uploaded-menu intake plus official website, PDF, ordering
page, and Web Search discovery adapters normalized into the shared menu-source
contract. It also owns bounded retrieval, URL and source validation,
provenance, and typed acquisition outcomes.

Discovery output is not canonical proof. This package does not render UI,
define culinary truth, persist canonical data, expose raw source URLs in logs
or public errors, or make a real provider call in automated tests.

The package manifest and shared interfaces are frozen at `1.0.0`.

U1.5 public surface remains `MenuSourceAcquisitionPort` and
`FakeMenuSourceAcquisitionPort`; U2.2 implements that frozen port without
changing its DTOs, outcomes, public errors, or environment contract.
The deterministic fake remains available for independent downstream work.

U2.2 adds a foundation implementation of `MenuSourceAcquisitionPort` with:

- an uploaded-menu adapter backed by an injected transient identity resolver;
- interface-only adapters for official websites, official PDFs, ordering
  pages, and Web Search discovery;
- common source/content classification, exact-fingerprint duplicate handling,
  conflict handling, and safe provenance projection into `MenuSourceInput`;
- a syntactic HTTPS/host safety precheck that never returns or logs raw URLs;
- deterministic, network-free fixtures for supported, unsupported, duplicate,
  conflict, timeout, unsafe, and no-source cases.

The discovery ports remain dependency-injected and perform no network access
themselves. S1.2 adds one server-only bounded retrieval boundary for official
HTML, PDF, and ordering-page collectors. It requires an injected DNS resolver
and a transport that pins connections to the verified addresses, disables
automatic redirects, revalidates every redirect hop, enforces the invocation
deadline and streaming byte limit, and accepts only the collector's approved
MIME types. Retrieved bytes remain in a request-scoped transient store behind
an opaque `TransientMenuContent` handle; normalized and final URLs stay inside
that package-owned provenance boundary. Provider-specific Web Search remains
separate S1.3 work. This package never returns source bodies, raw provider
responses, or raw URLs through the frozen shared port.
