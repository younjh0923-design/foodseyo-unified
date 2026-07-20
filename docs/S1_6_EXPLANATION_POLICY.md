# S1.6 Constrained Explanation Policy

Status: design-only preparation artifact
Contract authority: none
Runtime use: prohibited until the S1.5 handoff and required reviews are complete

This document prepares Juhyung's S1.6 explanation work without defining a new
canonical DTO, changing a frozen `1.0.0` contract, or authorizing production
explanation code. The companion corpus is
`docs/S1_6_GOLDEN_CASES.json`.

## 1. Purpose and trust boundary

Foodseyo explanations help a Korean-speaking user decide what to order while
preserving the meaning already selected by the canonical pipeline. The
explanation layer may simplify wording, but it must not select truth, resolve
conflicts, infer publication eligibility, or add facts.

The future renderer may receive only a publication-eligible canonical result
through an approved public boundary. It must not receive raw provider output,
source bodies, extraction DTOs, database rows, ORM types, or private transport
handles. Every factual phrase must be traceable to a selected canonical field,
its basis, and its provenance. Missing information stays missing.

## 2. Evidence-language rules

| Canonical basis | Required Korean wording pattern | Forbidden transformation |
| --- | --- | --- |
| `source_stated` | “메뉴에는 …라고 적혀 있어요.” or “공식 메뉴에 표시된 정보예요.” | Weakening a directly stated fact into “보통 …일 수 있어요,” or presenting another branch's statement as current-branch fact. |
| `inferred_from_source` | “메뉴 설명을 보면 …로 보이지만, 확정 정보는 아니에요.” | “들어 있습니다,” “알레르기 안전합니다,” or any wording that implies confirmation. |
| reviewed `culinary_baseline` | “일반적으로 이 음식은 …한 편이에요. 이 식당의 조리법은 확인이 필요해요.” | Claiming that the current restaurant confirms the ingredient, preparation, heat, allergen, or dietary property. |
| `unknown` | “확인된 정보가 없어요.” and, when safety-relevant, “주문 전에 직원에게 확인하세요.” | Converting unknown to absent, false, safe, confirmed, zero, or a default value. |

Direct evidence is not diluted by a baseline. Baseline knowledge can fill only
an upstream-approved gap and must remain visibly general. An inference must
remain an inference even when it sounds likely. The generated explanation is
never an independent evidence source.

## 3. Axis-language rules

Different sensory and descriptive axes remain separate. One axis must not be
used as evidence for another.

| Axis | User-facing rule | Example |
| --- | --- | --- |
| Basic taste | State only validated values such as sweet, salty, sour, bitter, or umami. | “단맛과 감칠맛이 표시되어 있어요.” |
| Flavor notes | Describe aroma or flavor character without turning it into an ingredient claim. | “고소한 풍미로 설명돼요. 견과류 포함 여부는 별도 확인이 필요해요.” |
| Texture | Describe mouthfeel only. | “바삭한 식감으로 표시돼요.” |
| Heat | Use the selected heat value and its basis. Do not let a baseline override a stated value. | “메뉴에는 순한 맛이라고 적혀 있어요.” |
| Richness | Describe perceived body or intensity without asserting fat, dairy, or calories. | “맛의 농후함은 진한 편으로 설명돼요.” |
| Typical ingredients | Always mark baseline ingredients as typical, not present at this restaurant. | “일반적으로 양파를 쓰기도 하지만, 이 식당의 재료는 확인이 필요해요.” |
| Preparation | Distinguish stated preparation from inferred or typical preparation. | “설명상 구운 조리로 보이지만 확정 정보는 아니에요.” |
| Cultural or culinary description | Keep it short, respectful, and general; never use it as branch-specific evidence. | “이 음식은 일반적으로 함께 나눠 먹는 형태로 알려져 있어요.” |

`nutty`, `buttery`, `cheesy`, and `creamy` are sensory descriptions. They do
not prove the presence of nuts or dairy. Heat and richness are independent.
Flavor and texture values do not establish preparation, ingredients,
allergens, dietary suitability, or safety.

## 4. Restaurant-state language

| Restaurant state | Safe wording |
| --- | --- |
| unresolved | “식당 지점을 확인하지 못했어요. 메뉴 사진 기준으로만 안내할게요.” |
| candidate | “가능한 식당 후보예요. 지점을 선택하면 해당 지점 정보로 확인할 수 있어요.” |
| conflicting | “식당 단서가 서로 맞지 않아요. 지점을 다시 확인해 주세요.” |
| `user_confirmed` | “사용자가 이 지점을 선택했어요.” |
| `externally_verified` | “외부 확인 정보로 이 지점이 확인됐어요.” |
| rejected | “이 후보는 선택한 식당이 아닌 것으로 표시됐어요.” |
| menu-only continuation | “식당 지점은 미확인이지만, 제공된 메뉴 정보만으로 계속 볼 수 있어요.” |

User confirmation must never be called external verification. An unresolved or
rejected restaurant does not automatically make a menu-photo-only analysis a
total failure. Restaurant state must not be used to invent branch-specific
price, ingredients, or evidence.

## 5. Safety and prohibited assertions

The explanation must never claim or imply that:

- `nutty` proves nuts are present;
- `creamy`, `buttery`, or `cheesy` proves dairy is present;
- unknown allergen or dietary information means safe;
- a typical ingredient is present at the current restaurant;
- silence on a menu proves absence;
- a reviewed baseline heat value overrides source-stated heat;
- a price from another restaurant branch applies to the current branch;
- inferred content was stated by the source;
- generated explanation text is new evidence or a source of truth;
- user confirmation is external verification;
- publication eligibility can be decided by the explanation layer.

Safety-relevant unknowns use neutral wording and a practical action: “확인된
정보가 없으니 주문 전에 직원에게 알레르기와 교차접촉 가능성을 확인해
주세요.” Foodseyo must not give a safety guarantee.

## 6. Deterministic fallback policy

Fallback text is fixed by state so repeated analysis remains consistent.

| Situation | Deterministic fallback |
| --- | --- |
| Explanation generation unavailable | “메뉴 분석 결과는 준비됐지만 자세한 설명을 만들지 못했어요. 확인된 메뉴 정보만 보여드릴게요.” |
| Partial canonical result | “확인된 정보만 정리했어요. 표시되지 않은 항목은 확인되지 않았어요.” |
| No reviewed baseline | “추가로 참고할 수 있는 검토된 일반 음식 정보가 없어요.” |
| Unresolved Dish | “어떤 일반 음식과 연결되는지 확인되지 않았어요. 메뉴에 적힌 정보만 안내할게요.” |
| Restaurant unresolved | “식당 지점을 확인하지 못했어요. 제공된 메뉴 정보만 기준으로 안내할게요.” |
| Conflicting evidence | “정보가 서로 달라 확정하지 않았어요. 주문 전에 식당에 확인해 주세요.” |
| Unknown field | “이 항목은 확인된 정보가 없어요.” |
| Missing price | “현재 지점의 확인된 가격 정보가 없어요.” |
| No official menu source | “공식 메뉴 출처를 확인하지 못했어요. 제공된 자료에서 확인된 내용만 보여드려요.” |

Fallback must not fill a gap with general knowledge unless the canonical result
already contains a reviewed baseline. Service failure must not discard safe,
already validated information.

## 7. Tone and usefulness

- Lead with the decision-relevant fact: what the dish is, its validated taste,
  texture, heat, and price when available.
- Use short Korean sentences and familiar words. Explain technical uncertainty
  without exposing tokens such as `source_stated` to ordinary users.
- Put safety uncertainty next to the relevant ingredient or allergen statement.
- Prefer one useful action over a long disclaimer: ask the staff, choose the
  correct branch, or review the menu source.
- Do not repeat the same caveat in every sentence. Group caveats without
  weakening them.
- Identical canonical input, renderer version, and locale should produce
  semantically equivalent wording.

## 8. Evaluation rubric

Each golden case is evaluated on six dimensions. A safety or trust-boundary
failure is an automatic rejection.

1. **Faithfulness:** every factual statement is traceable to supplied canonical
   semantics.
2. **Basis visibility:** stated, inferred, typical, unknown, and conflicting
   meanings remain distinguishable.
3. **Safety restraint:** no allergen, dietary, ingredient, or branch safety
   claim is invented.
4. **Axis separation:** taste, flavor, texture, heat, richness, ingredients,
   and preparation are not conflated.
5. **Decision usefulness:** the user learns what can be decided now and what to
   ask or verify.
6. **Consistency:** fallback and uncertainty wording remain deterministic.

## 9. Future handoff requested from Youn

Production S1.6 remains blocked until Youn supplies a stable minimum S1.5
fixture through an approved public boundary. The following are candidate
semantic requirements for that later implementation review, not new frozen
field names or a proposed DTO shape:

- stable analysis identity;
- stable MenuItem identity for item-scoped explanation;
- selected field values separated by sensory or descriptive axis;
- basis and safe provenance for each selected value;
- explicit unknown and conflict state;
- restaurant state and branch identity when branch-specific facts are used;
- upstream publication eligibility;
- safe user-facing operational state or warning information;
- Dish resolution and reviewed-baseline availability where applicable.

Any missing or differently modeled detail stays unresolved until the exact
S1.5 fixture and public entry point are reviewed. S1.6 must adapt to the
approved boundary; it must not create a competing canonical shape.

## 10. Future implementation acceptance checklist

- [ ] Accepts only upstream publication-eligible canonical input.
- [ ] Imports input and result types only from approved public entry points.
- [ ] Receives no raw provider, source body, extraction DTO, database row, or
      ORM input.
- [ ] Adds no fact absent from canonical input.
- [ ] Traces every explanation claim to a canonical value, basis, and safe
      provenance.
- [ ] Preserves unknown, conflict, and branch isolation.
- [ ] Phrases reviewed baseline as typical or general.
- [ ] Uses deterministic fallback when generation is unavailable or partial.
- [ ] Post-validates any future GPT output before it reaches the UI.
- [ ] Handles bounded timeout and cancellation through frozen invocation
      semantics.
- [ ] Passes the golden-case regression corpus.
- [ ] Leaves publication eligibility and canonical precedence upstream.

## 11. Current blockers

Production implementation must not start until PR #25 is merged, Youn provides
the stable minimum S1.5 canonical output fixture, and the approved public
boundary is available. Actual model-backed explanation also requires explicit
provider and environment authorization. Production S1.7 remains separately
blocked by the result-experience and web/intake contract dependencies.
