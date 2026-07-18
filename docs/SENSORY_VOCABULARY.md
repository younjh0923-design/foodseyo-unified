# Foodseyo sensory vocabulary

## Contract status

This document specifies the candidate U1.2 shared vocabulary. Its version is
`shared-vocabulary/0.1.0`, and it remains `draft` until U1.6 publishes the
selected compatibility contracts as `1.0.0`.

The executable source is `@foodseyo/contracts`. Applications and feature
packages must not create local aliases, enums, scales, or descriptor lists.

## Standards and evidence basis

The design is standards-informed:

- [ISO 5492:2008](https://www.iso.org/standard/38051.html) provides sensory
  analysis vocabulary;
- [ISO 11035:1994](https://www.iso.org/standard/19015.html) describes how
  descriptors are identified and selected for a sensory profile;
- [ISO 13299:2016](https://www.iso.org/standard/58042.html) describes general
  guidance for establishing a sensory profile;
- [ISO 11036:2020](https://www.iso.org/standard/76668.html) covers sensory
  texture profiling;
- [ISO 4121:2003](https://www.iso.org/standard/33817.html) covers quantitative
  response scales;
- the
  [U.S. National Institute on Deafness and Other Communication Disorders](https://www.nidcd.nih.gov/health/taste-disorders)
  distinguishes the five basic tastes from the common chemical senses;
- a
  [peer-reviewed chemesthesis review](https://pmc.ncbi.nlm.nih.gov/articles/PMC4667542/)
  supports treating pungency and burning separately from basic taste.

Foodseyo does not claim that its descriptors form a universal ISO list, that
an AI estimate is a trained sensory-panel measurement, or that the application
performs a certified laboratory sensory assessment. The standards inform axis
separation, definitions, controlled descriptors, and ordered response design.

## Five separate axes

| Axis | Contract | Meaning |
| --- | --- | --- |
| Basic taste | `sweet`, `salty`, `sour`, `bitter`, `umami` | The five canonical taste qualities. |
| Flavor note | controlled lexicon below | Aroma or flavor impressions that are not basic-taste values. |
| Texture | controlled lexicon below | Mechanical, structural, and mouthfeel properties. |
| Heat | `none < mild < medium < hot < very_hot` | Chemesthetic pungency or burning. |
| Richness | `light < moderate < rich` | A derived summary of perceived weight, coating, density, or concentration. |

There is no generic `taste` field. A single string such as
`savory-smoky-hot` is invalid because it collapses separate axes.

`savory` and `savoury` are accepted input aliases for canonical `umami`.
They are not additional basic-taste values.

## Controlled flavor notes

The initial Foodseyo lexicon contains:

- `smoky`: a smoke-like aroma or flavor impression;
- `herbal`: an aroma impression associated with fresh or dried herbs;
- `nutty`: a roasted-nut-like aroma or flavor impression;
- `earthy`: a soil-like, root-like, or forest-floor aroma impression;
- `garlicky`: a garlic-like aroma or flavor impression;
- `buttery`: a butter-like aroma, flavor, or coating impression;
- `cheesy`: a cheese-like aroma or flavor impression;
- `fruity`: a non-citrus fruit-like aroma or flavor impression;
- `citrusy`: a citrus-peel, citrus-juice, or citrus-like aroma impression;
- `fermented`: an impression associated with fermentation.

Aliases are normalization aids and never become new canonical values. The
complete alias registry is executable in `FLAVOR_NOTE_DEFINITIONS`.

Perceptual descriptors are not ingredient claims. In particular, `nutty` does
not prove nuts, and `buttery` or `cheesy` does not prove dairy.

## Controlled textures

The initial Foodseyo lexicon contains:

- `crispy`, `crunchy`, `creamy`, `tender`, `chewy`, `juicy`, `flaky`, `soft`;
- `firm`, `dense`, `airy`, `silky`, `sticky`, `springy`, `crumbly`, `moist`.

Each value has one executable definition and controlled aliases in
`TEXTURE_DEFINITIONS`. The distinction between nearby terms is intentional:
for example, `crispy` emphasizes readily fractured thin or dry structure,
while `crunchy` emphasizes repeated fracture of a firmer structure.

`creamy` describes mouthfeel and does not prove dairy.

## Heat, richness, unknown, and adjustability

Heat and richness are separate ordered scales. Their values cannot be mixed.
Every claim also carries a separate `known` or `unknown` state. `unknown` is
not a heat or richness level and must not be coerced to `none`, `light`, zero,
absence, false, allergen-safe, or dietary-safe.

Heat is a chemesthetic sensation. Its level describes observed or typical
pungency only when evidence supports it. `none` requires affirmative evidence;
the absence of a spice note does not prove `none`.

Richness is a user-facing derived summary, not a basic taste and not an
ingredient fact. It must be based on explicit source evidence or a labeled
culinary baseline under the frozen evidence precedence.

Heat adjustability is independent:

- `fixed`: evidence says the served heat is not user-selectable;
- `user_selectable`: evidence says the user can choose a heat level.

Missing adjustability evidence remains `unknown`; it must not default to
`fixed`.

## Remaining U1.2 groups

- Ingredient roles remain `core`, `typical`, `optional`, `regional_variant`,
  and `preparation_dependent`.
- Restaurant resolution remains `candidate`, `user_confirmed`,
  `externally_verified`, `rejected`, or `conflicting`.
- Menu scopes are `default`, `all_day`, `breakfast`, `brunch`, `lunch`,
  `dinner`, `drinks`, `dessert`, `happy_hour`, `kids`, `late_night`, and
  `seasonal`. `default` means the source does not establish a narrower scope;
  it does not mean `all_day`.
- Menu lifecycle remains `draft`, `active`, `stale`, `superseded`, or
  `retired`.
- Dish matching is `candidate`, `matched`, `rejected`, or `unresolved`.
  `reviewed` is not a match state.
- Knowledge origin is `model_generated`, `human_authored`, or `imported`.
- Knowledge review is `unreviewed`, `reviewed`, `superseded`, or `retired`.
  Model generation is provenance, not review.

## Evidence and change rules

All sensory and culinary statements retain:

```text
source_stated
> inferred_from_source
> culinary_baseline
> unknown
```

General culinary knowledge fills only missing context and cannot override
contradictory menu evidence. A vocabulary update is a shared contract change:
it requires an issue, version-impact review, deterministic valid and invalid
fixtures, a dedicated PR, and the approval tier in
`CONTRACT_CHANGE_QUEUE.md`.
