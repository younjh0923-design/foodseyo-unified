# Foodseyo Unified

Foodseyo helps travelers and people exploring unfamiliar cuisines understand
menu dishes and decide what to order. It is not a restaurant-ranking product.

This repository is a greenfield team implementation. The three legacy
repositories are evidence and design references only; no legacy repository is
merged wholesale and no legacy module is treated as the new source of truth.

## Submission must-have flow

The submission must complete one coherent path:

```text
menu/sign photos plus a restaurant, map, or official-source link
-> YTW-owned Google Places restaurant and branch resolution
-> YTW-owned official menu-source discovery and acquisition
-> YTW-owned OpenAI Web Search fallback when official acquisition fails
-> YTW-owned compact menu extraction
-> Youn-owned canonical normalization, culinary consistency, and safety checks
-> Juhyung-owned menu and dish explanation from validated canonical structure
-> Youn-owned database persistence and reuse
-> Juhyung-owned mobile ordering-decision experience
```

Google Places identifies the restaurant branch and supplies official-source
clues such as its website. It is not treated as a full menu-item API. Every
acquired menu must pass the shared source, provenance, canonical, and safety
contracts before explanation or persistence.

The three workstreams develop in parallel after U1, but the runtime trust path
does not bypass validation. YTW may send UI-safe candidates, progress, and
typed outcomes directly to Juhyung; extracted menu meaning reaches Juhyung only
after Youn-owned canonical validation.

These capabilities are submission requirements, not post-submission
aspirations. `docs/TASK_MASTER.md` is the execution source of truth for their
owners, dependencies, and release gates.

## Approved platform

- Application hosting and release target: **Vercel**
- Database platform: **Neon Serverless Postgres**
- Database schema and migration layer: **Drizzle**, after its assigned
  Development checkpoint
- AI provider: **OpenAI**, server-side only
- Restaurant resolution: **Google Places**, server-side only
- Package manager: **pnpm**

Supabase is a legacy-repository dependency and is not part of the unified
runtime. Exact approved, prohibited, and still-pending choices live in
`docs/TECH_STACK.md`; legacy environment names must not be copied into this
repository.

## GPT-5.6 및 Codex를 활용한 개발

Foodseyo는 설계, 구현, 검토 및 통합 전반에 걸쳐 GPT-5.6과 Codex의 지원을 받으며 우리 팀이 개발했습니다.

### GPT-5.6

- 백엔드 아키텍처 설계 논의를 지원
- 식당 식별(restaurant resolution) 워크플로우 개선 지원
- 메뉴 추출 요구사항 정의 및 프롬프트 설계 지원
- API 계약 및 통합 관련 의사결정 검토 지원

### Codex

- TypeScript 코드 구현 및 코드 리뷰 지원
- 백엔드 컴포넌트 통합 지원
- 필요한 검증(Validation) 코드 추가 및 실행 지원
- 구현 과정과 CI(지속적 통합) 이슈 진단 지원
- Build Week 기간 동안 Pull Request 작성 및 반복 개선 지원

모든 제품 관련 의사결정, 보안 검토 및 최종 코드 변경 사항은 Foodseyo 팀이 직접 검토하고 승인했습니다.

## Start here

1. [Approved technology stack](docs/TECH_STACK.md)
2. [Product flow](docs/PRODUCT_FLOW.md)
3. [Shared contracts](docs/SHARED_CONTRACTS.md)
4. [Sensory vocabulary](docs/SENSORY_VOCABULARY.md)
5. [Boundary DTOs](docs/BOUNDARY_DTOS.md)
6. [Module interfaces](docs/MODULE_INTERFACES.md)
7. [Shared contract change guide](docs/CONTRACT_CHANGE_GUIDE.md)
8. [Contract change queue](docs/CONTRACT_CHANGE_QUEUE.md)
9. [Task master](docs/TASK_MASTER.md)
10. [Team ownership](docs/TEAM_OWNERSHIP.md)
11. [Integration protocol](docs/INTEGRATION_PROTOCOL.md)
12. [Legacy reference map](docs/LEGACY_REFERENCE_MAP.md)

## Compatibility gate

U1.6 is complete. PR #18 promoted the selected shared contracts and eight
package manifests to `1.0.0`/`frozen` and merged to `main` as
`e01a67306e319f9aec4b050477eacfbca99ffb31`. U2 feature branches may now begin
in parallel from that frozen compatibility baseline. Later shared-contract
changes still require the contract-change process.

## Local validation

```powershell
pnpm install
pnpm verify
```

No real provider request, database migration, or deployment is part of the
repository bootstrap. The statements above describe the required submission
scope; a capability is complete only after its task acceptance criteria and
release gates pass.
