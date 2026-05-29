# Staff-Side POS / Inventory Landscape for Salamarket Stock

**Date:** 2026-05-30
**Author:** Strategy research pass
**Audience:** Salamarket product + engineering (K & A FOOD, Toulouse)
**Context:** `apps/stock` (Next.js 14 PWA, staff PIN auth, kanban realtime, multi-dépôt) competing in halal premium grocery with a Drive at retail price + click & collect.

---

## 1. Executive Summary

**The headline:** the difference between a forgettable staff POS and a great one in 2026 is no longer feature count — it's *operational coherence under pressure*. Toast wins on coherence (additive updates, motor-pattern preservation) and still loses on broken void/refund flows. Square invests heavily in front-end but breaks cashier conditioning every quarter. Lightspeed under-invests. Cashmag (Salamarket's current POS) is a French NF525-compliant SaaS that scores 8.8/10 for basic cash but is **silent on multi-store inventory, picking, e-commerce sync, and fresh/weight workflows** — exactly the surface area Salamarket lives on.

**What a great staff POS looks like in 2026:**

1. **Touch-first, glanceable** — designed for divided attention (customer + screen + queue), big tap targets, readable from 60 cm without focusing.
2. **Conditioning-stable** — UI changes are additive; never relocate the "pay" or "weigh" button without an opt-in transition period.
3. **One workflow per role** — caisse / préparation / réception are separate apps in a single shell, not modal toggles.
4. **Realtime kanban + batch pick** — already Salamarket's posture; this is now table stakes versus Picnic / Instacart Fulfillment Pro / La Belle Vie.
5. **Compliance baked in, invisible** — NF525 ISCA (Inaltérabilité, Sécurisation, Conservation, Archivage) + HACCP DLC alerts + halal traceability are *required by French law and AVS/ARGML* but should never block a sale.
6. **AI as a copilot, not a feature** — pick-list reordering (Instacart cut pick time 30%), demand forecasting (37-76% perishable waste reduction reported), and CV shrinkage detection (Trigo) are now ROI-positive in months, not years.

**Salamarket's exploitable gap vs. French halal competitors:** every competitor scanned (halal-store.fr, halalmarket.fr, halalcourses, mahalle, halbutche, halal-frais, halaldistrib) competes on *delivery time and certification badges*. **None ship a customer-facing pickup screen, none expose live traceability per lot to the customer, none have a public staff app story.** Salamarket already runs a staff PWA with kanban, pesée, écart-action automation, multi-dépôt — this is multiple years ahead of the French halal pack and roughly at parity with La Belle Vie minus the warehouse robotics. The strategic move is to keep widening that gap on **traceability + pickup experience + fresh-waste forecasting**, not on robotics.

---

## 2. Direct Competitors

### 2.1 French halal grocery — the landscape is shallow

| Player | Model | Staff/ops surface visible | Notable |
|---|---|---|---|
| **halal-store.fr** | E-commerce nationwide | None public | Bare-bones Shopify-style site |
| **halalmarket.fr / market-halal.com** | E-commerce B2C + B2B | "Certitrace 786" badge, no app | Site shows signs of CMS compromise (gambling blog posts mixed in); claims traceability but no public proof surface |
| **Amanbox** | Frozen halal, 24-48h national | None public | Cold-chain pitch only |
| **Coq d'Or Shop** | Meat, 5-48h national | None public | — |
| **Halalcourses** | Pantry, 24h national | None public | Price-driven |
| **Mahalle** | Meat & charcuterie, <48h | None public | — |
| **Halbutche / Halal Frais / Halal Distrib** | Online butchery | None public | All in the same template |
| **Tawhid Paris (traiteur)** | Physical traiteur + catering | None public | No e-commerce surface found |

**Key finding:** the entire French halal e-commerce field is competing on **delivery speed + certification badge**. There is **no visible best-in-class staff app, no live traceability surface, no pickup experience innovation**. Salamarket's Drive + Stock combination is already a category outlier; the moat is widenable.

### 2.2 Premium / bio grocery (UX benchmark)

- **Naturalia** — has a consumer mobile app on Google Play; in-store POS uses standard mass-market grocery POS (not a published platform). Strong on private-label + bio storytelling, weak on staff-facing innovation visible externally.
- **La Vie Claire** — same posture. Loyalty app for customers, no public staff app story.
- **Carrefour Drive / Leclerc Drive / Chronodrive** — the actual benchmark for click & collect at scale in France. Use proprietary picker apps with route-optimised pick lists, scanner guns, tote-per-order workflows, and dedicated drive-up bays with license-plate detection on Carrefour. Customer-facing pickup is via SMS + bay number on a display board.

### 2.3 Modern online grocery (the real bar)

- **La Belle Vie (FR, Paris)** — most relevant peer. Built ERP + WMS + delivery management from scratch. 7 distribution hubs in Paris, 15-min delivery target. Onboarding/training for pickers is *fully digitised*. Tech is the moat. ([Crunchbase](https://www.crunchbase.com/organization/la-belle-vie), [TechCrunch 2021](https://techcrunch.com/2021/12/16/la-belle-vie-raises-28-million-to-build-an-online-supermarket-from-scratch/))
- **Picnic (NL)** — Europe's most advanced grocery delivery tech stack. Fully automated fulfilment centre, in-house driver app, hybrid pick stations, ML personalisation. Engineering blog is a goldmine for inspiration. ([Picnic Tech](https://jobs.picnic.app/en/tech))
- **Gorillas / Flink / Getir (dark stores)** — the apps are split between *pickers* and *riders*; orders are timed; pickers know their role to the second. Gorillas UI is widely praised for "everything feels deliberate." Flink optimised for zero-friction first-order conversion. ([UXCam Flink vs Gorillas](https://uxcam.com/blog/app-analysis-gorillas-flink/))
- **Ocado (UK)** — Smart Platform with Hummingbird robots (4 m/s) + OCADEX robotic pick arms. Sold as OSP to other grocers. Reduces manual labour by 50% with robotic picking. ([Ocado Group](https://www.ocadogroup.com/about-us/our-technology)) — out of scope for Salamarket's scale, but the *tower-based bin retrieval* pattern is interesting for future labo workflows.
- **Instacart Fulfillment Pro** — 50,000+ retail associates, 45M+ orders in 2025. AI-optimised pick lists by aisle location cut pick time 30%. Megabatching (20+ orders/run). Tote-based bin workflows. Real-time translation for cashier-customer chat. Self-serve batching + scheduling for managers. ([Instacart blog](https://company.instacart.com/enterprise-blog/expanding-fulfillment-pro-with-new-picking-and-delivery-solutions), [The Shelby Report 2026-05-14](https://theshelbyreport.com/2026/05/14/instacart-expands-fulfillment-pro-with-new-picking-delivery-tools/))

### 2.4 What competitors don't do — Salamarket's exploit list

| Gap | Who has it? | Salamarket opportunity |
|---|---|---|
| Live per-lot halal traceability surfaced to the customer (QR on the receipt → batch + certifier + slaughter date) | Nobody in FR halal | High-trust differentiator; cheap to ship if `produits` carries `lot_id` + `certifier_id` |
| Customer-facing pickup screen (TV at counter showing "Commande #142 prête bay 2") | Carrefour Drive has plate detection; nobody in halal | Builds queue calm + delights customers; tiny build |
| Predictive ordering on fresh halal meat | None in FR halal | Highest ROI feature on this list — fresh halal carcasses are zero-margin past DLC |
| Picker batch mode that triggers temperature-zone bag assignment | Instacart Shop2Bag, Picnic | Salamarket already has `Batch Pick` — extend with cold/sec zone hints |
| Realtime écart-action like Salamarket's already-built `auto_accept` / `client_validation_required` | Almost nobody at small-mid scale | Already shipped — promote it |

---

## 3. POS UX Patterns — best practice in 2026

Source: [POS UX Benchmarking 2026 (interface-design.co.uk)](https://interface-design.co.uk/blog/pos-software-ux-benchmarking-2026-the-coherence-gap/) — the most rigorous public benchmark of Toast / Square / Lightspeed / NCR / Oracle.

### 3.1 The four-criteria framework worth stealing

1. **Attention Economy** — does the interface work without sustained visual focus? Cashier is looking at the customer, the queue, the scanner, the screen.
2. **Conditioning Stability** — do updates preserve motor sequences? Cashiers build muscle memory in days; UI changes reset that and cost real money.
3. **Taxonomy Alignment** — does product search match cashier vocabulary (the "Coca rouge 33", not "BOI-CCL-0033-EU-33CL")?
4. **Error Recovery Speed** — when something fails (printer, payment, void), how many taps to recover?

### 3.2 What the benchmark found

**Toast — best at conditioning, broken on error recovery:**
- Preserved core navigation through additive updates over 3 years. Cashiers don't need retraining.
- BUT: printer routing bug unfixed for 2 years; void/refund workflows fail mid-transaction; labour scheduling UI is so bad operators use manual alternatives.
- Lesson: "features exist but have drifted from operational reality" = sense decay.

**Square — most visible front-end investment, broke its own conditioning:**
- AI-powered cashier-language search is the right idea.
- Sept 2025 forced UI rollout caused 2-3 second search lag, broke cash drawer timing mid-transaction.
- Lesson: never force-deploy UI on a queue-facing tool without an opt-in window.

**Lightspeed — under-investment:**
- No front-end redesign 2023-2026. "Unclear signposting", "system glitches" in independent testing. Discount creation requires unintuitive navigation.

**NCR Aloha / Voyix + Oracle Simphony** — monoliths with steep learning curves; Oracle's new $55/mo tier "expands access to unresolved operational problems."

### 3.3 Concrete UX patterns to copy

- **Big, idempotent action buttons** — primary actions (pay, weigh, validate) at the bottom-right for right-handed thumb reach on tablet.
- **No destructive action without two-tap confirm** — void, refund, cancel order need a second tap, never a long-press (long-press is invisible).
- **Search by phonetic + partial + EAN simultaneously** — "cola" returns Coca-Cola, "coca" returns same; EAN scan auto-completes.
- **Error states are first-class screens, not toasts** — "imprimante hors ligne — réessayer / imprimer plus tard / continuer sans ticket" with a single visible CTA per state.
- **Forced updates are an anti-pattern** — schedule them, announce them, offer rollback for 48h.
- **Quantitative reality check the benchmark cites:** 75.8% annual turnover in hourly retail; ~$620K/year staff turnover cost for a 100-employee retailer with POS friction named as contributor; 64% of shoppers blame poor experiences on unprepared staff. POS UX is a P&L line, not aesthetics.

### 3.4 French regulatory POS baseline (NF525)

- Mandatory for any business selling to consumers and collecting TVA. Sources: [agiris.fr](https://www.agiris.fr/articles/logiciel-de-caisse-certifie-nf525-lne-obligations), [yzico.fr](https://www.yzico.fr/caisse-enregistreuse-nf525-votre-guide-pour-etre-conforme-des-le-1er-janvier-2026/), [economie.gouv.fr](https://www.economie.gouv.fr/entreprises/gerer-son-entreprise-au-quotidien/gerer-sa-comptabilite-et-ses-demarches/ce-quil-faut-savoir-sur-la-certification-des-logiciels-de-caisse).
- **ISCA principles:** Inaltérabilité (no edit/delete validated tx), Sécurisation, Conservation (6 years), Archivage (timestamped JFT — Journal des Événements + Grand Total + Fiscal closures).
- **2026 finance law restored self-certification** by software editor (alternative to NF525 by Infocert/AFNOR or LNE).
- **Until 2026-09-01** — Cashmag (or any POS) must present proof of editor certification process.
- **Practical implication for Salamarket:** if Stock ever takes a payment directly (not via Cashmag forward), it must implement JFT, closures (Z), and 6-year retention. Today this is handled by Cashmag. If you replace Cashmag, you inherit NF525 obligations.

---

## 4. Picking App Patterns — Picnic, Instacart, La Belle Vie

### 4.1 Instacart Fulfillment Pro (the best-documented in 2026)

Source: [Instacart enterprise blog](https://company.instacart.com/enterprise-blog/expanding-fulfillment-pro-with-new-picking-and-delivery-solutions), [docs.instacart.com](https://docs.instacart.com/storefront/learn_about_your_storefront/fulfillment/partner_pick/), [The Shelby Report 2026-05-14](https://theshelbyreport.com/2026/05/14/instacart-expands-fulfillment-pro-with-new-picking-delivery-tools/).

Concrete patterns:

- **AI-optimised pick list ordered by aisle location → 30% in-store time reduction.** Each order's items are pre-sorted to minimise picker walk.
- **Megabatching: 20+ orders per run** with intelligent load optimisation. For Salamarket, even 5-10 orders concurrently would compound throughput.
- **Tote-based workflow** — each order has a dedicated tote/bin; items are scanned *into* the tote, eliminating mixed/missing items. This is huge: it converts "did I bag this right?" into a hardware-enforced invariant.
- **Real-time customer chat with auto-translation** — picker can ask "no Heinz mayo, OK with Hellmann's?" and customer answers in their language; Instacart translates both sides.
- **Substitution UX:** customer pre-approves substitutions when ordering; picker sees those preferences inline; only contacts customer when none apply.
- **Staging:** picked orders go to a staging area mapped in the app; the system tells the runner *which bay/shelf* a finished order sits on.
- **Manager controls:** self-serve batching rules, scheduling, expedite buttons, bulk labor schedules across locations.
- **Acceptance SLA:** batches must be accepted within 4 minutes.
- **Shop2Bag** — pick directly into customer-final temperature-zoned bag (cold / ambient / frozen), eliminating a re-bagging step at handoff.

### 4.2 Picnic, Gorillas, Flink, La Belle Vie

- **Picnic** — fully automated FC, hybrid pick stations (robot brings bin to human), proprietary driver app. The picker app emphasis is "perfect first pick" — no rework downstream. ([Picnic Tech](https://jobs.picnic.app/en/tech))
- **Gorillas / Flink** — dark store with two role types (picker + rider). Each order is timed; everyone knows their role to the second. UI praised for "deliberateness" — every element exists for a reason. ([UXCam analysis](https://uxcam.com/blog/app-analysis-gorillas-flink/))
- **La Belle Vie** — proprietary ERP + WMS + delivery management, fully digitised onboarding/training for pickers, 15-min delivery target. ([TechCrunch 2021](https://techcrunch.com/2021/12/16/la-belle-vie-raises-28-million-to-build-an-online-supermarket-from-scratch/))

### 4.3 What Salamarket already has vs. these benchmarks

From `apps/stock` + `CONTEXT.md`:

- Kanban 4 columns `a_preparer → en_preparation → pret → retire` — equivalent to dark-store status flow.
- Batch Pick mode aggregating by product, sorted by rayon (cold first) — equivalent to Instacart pick list optimisation, *without* AI yet.
- Pesée + écart-action automation (`auto_accept` <10%, `preparator_decision`, `client_notify`, `client_validation_required` >20%) — *more sophisticated than what Instacart documents publicly*. Major asset.
- Multi-dépôt + transfers + réception + labo — matches La Belle Vie's surface, smaller scale.

**What's missing vs. these benchmarks:**

1. **Tote-per-order with scan-into-tote** — eliminates a class of errors. Cheap to add (a `tote_id` column on `commandes_drive` + a scan event).
2. **AI pick-list ordering** — today sort is rayon-based heuristic; could learn picker patterns per dépôt.
3. **Staging map** — once `pret`, where is the order physically? A simple `bay_label` (A1, A2, …) printed on the receipt and shown on a counter screen.
4. **Picker-customer chat** — for substitutions and weight escalations. Already partly modelled via `client_notify` action but no chat surface.
5. **Megabatch UI for multi-order pick** — Batch Pick exists; surface "you are picking for orders #142, #143, #145 — 17 items total" with per-order tote allocation.

---

## 5. Halal Compliance — what's legally required vs. nice-to-have

### 5.1 Two layers of regulation

**Layer A — French/EU food safety (mandatory for any grocery):**
- **HACCP** plans (Hazard Analysis Critical Control Points) — temperature logs, DLC/DLUO tracking, allergen separation, cleaning logs.
- **Réglementation européenne sur la traçabilité alimentaire** — one-step-back / one-step-forward traceability for every lot. Records kept typically 5 years (longer for specific categories).
- **NF525** — see §3.4.
- Sources: [alamana.fr](https://alamana.fr/logiciel-tracabilite-boucherie/), [lnsoftware.fr](https://lnsoftware.fr/logiciel-tracabilite-alimentaire).

**Layer B — Halal certification (contractual + reputational):**

- **AVS** (Association de Vérification et de contrôle de la Sécurité halal) — French non-profit. Requires *independent (non-employee) Muslim controllers permanently present at production sites* and a *secure traceability system*. Specific operational charter is private and contract-bound. ([avs.fr](https://avs.fr/en/halal-certification/), [Wikipedia](https://en.wikipedia.org/wiki/AVS_(halal_certification)))
- **ARGML** (Association Rituelle de la Grande Mosquée de Lyon) — accredited by several foreign countries as export reference. Controls "from slaughter to final packaging." Hygiene & Quality Charter is private. ([argml.com](https://argml.com/en/halal-certification/meat/))
- **Mosquée de Paris** — historic third major certifier in France.
- **Crescent Rating** — Singapore-based (since 2008), 1-7 scale, primarily *hospitality/travel* (hotels, restaurants, theme parks) — not a grocery cert. Useful as a vocabulary reference for trust signalling. ([crescentrating.com](https://crescentrating.com/))

### 5.2 What a halal grocery legally must prove and document

Synthesising the AVS / ARGML public docs + EU food law:

| Obligation | Concrete record | Salamarket's `produits` / `receptions` should carry |
|---|---|---|
| Lot traceability upstream (supplier → reception) | Lot/batch number, supplier SIRET, BL number, reception date | `receptions_lignes.lot`, `fournisseurs.siret` |
| Lot traceability downstream (reception → sale) | Lot tied to each sold item OR aggregate FIFO/FEFO on weight items | needs `stock_par_depot_lot` (not currently in schema?) |
| Cold-chain proof | Temperature log per cold storage zone, every 30 min or less | likely external sensors; integration via webhook |
| DLC / DLUO alerts | Auto-warning before expiry per lot | needs `lot_dlc` + alert engine |
| Halal certification per supplier | Cert PDF + certifier + expiry per supplier | `fournisseurs.halal_cert_*` |
| Physical separation halal/non-halal | Documented zones + no cross-contact | operational + signage; data model can carry `zone_halal` flag |
| Audit-ready records | All above for 5+ years, exportable on request | Supabase retention + audit export endpoint |
| Independent controller access (AVS/ARGML) | Read access to traceability + on-site presence | a read-only "auditor" role in `employes.role` |

### 5.3 Nice-to-have (not legally required, but high-trust)

- **QR on every customer receipt → lot history page** ("Votre viande de bœuf, lot L2026-05-A23, abattue le 2026-05-22, certifiée ARGML, fournisseur Boucherie X, SIRET …, contrôlée par M.Y"). This is what nobody in French halal e-commerce does today. Major moat.
- **Public certifier badge with live cert expiry** ("Halal certifié AVS, certificat valide jusqu'au 2027-03-15").
- **Customer-facing temperature timeline** for cold-chain items.

---

## 6. Innovative Features Ranked by ROI

### 6.1 Table-stakes 2026 (ship within 6 months or fall behind)

| Feature | Why now | Effort | Impact |
|---|---|---|---|
| **AI demand forecasting on fresh** | 37-76% perishable waste reduction reported; payback 3-6 months ([Bright Minds AI](https://thebmai.com/blog/ai-forecasting-supermarket-chains), [OrderGrid](https://www.ordergrid.com/case-studies/from-stockouts-to-success-a-grocery-chain-cuts-waste-and-grows-sales-with-ai), [Afresh](https://www.afresh.com/resources/forecasting-fresh-why-every-grocery-store-needs-ai)) | M | XXL — direct margin |
| **DLC/DLUO auto-alerts + FEFO suggestions** | EU + HACCP requirement, modern butcher software (MaBoucherie, Konnect Agro, Wektoo) all do this | S | L |
| **Per-lot halal traceability + customer-facing QR** | Zero competitors in FR halal do this | M | XL trust moat |
| **Tote-per-order picker workflow** | Eliminates a class of pick errors; Instacart standard | S | L |
| **Staging map / bay label for ready orders** | Cuts counter chaos at peak | XS | M |
| **Customer-facing pickup screen** (TV at counter, order numbers + bay) | Carrefour Drive standard; halal field has none | XS | M |
| **Picker ↔ customer chat for substitutions** | Instacart standard; Salamarket already has `client_notify` action — add chat | M | M |
| **NF525 self-certification proof exportable on demand** | 2026-09-01 deadline; required if Stock ever takes direct payment | S | regulatory |

### 6.2 Differentiators (ship next 12 months — wow factor)

| Feature | Why | Effort | Impact |
|---|---|---|---|
| **Predictive ordering algorithm** tuned for halal carcass cycles (Aïd peaks, Ramadan demand curve) | No off-the-shelf model captures this; proprietary moat | L | XL |
| **CV shrinkage detection on existing CCTV** (Trigo-style, capex-free) | $130B retail theft problem; works with existing cameras; instant ROI reported ([Trigo Retail](https://www.trigoretail.com/trigo-retail-launches-computer-vision-ai-powered-loss-prevention-solution/)) | L (integrate vendor) | M-L |
| **Voice picking for the labo / réception** (hands-free while handling meat) | Standard in large warehouses; novel at this scale | M | M |
| **Real-time profitability dashboard per SKU per dépôt** (live margin after pesée écarts) | Pesée écart-action data already exists in `drive_ecarts_poids` — uplift into a dashboard | S | L |
| **Dynamic pricing on near-DLC fresh** (Wasteless / Afresh model) | Auto-discount 30% at J-1, 50% at J for fresh halal meat | M | L |
| **Auditor read-only role** with live traceability dashboard for AVS/ARGML controllers | Removes friction for cert audits | S | M |

### 6.3 Ambitious / wow (12-24 months, signal-level features)

| Feature | Why | Effort | Impact |
|---|---|---|---|
| **Smart shelf weight sensors on premium meat** | Real-time stock + theft detection | XL | M |
| **AR picking glasses for labo** (Google Glass Enterprise revival, RealWear) | Wow factor, marginal time gain at small scale | XL | S |
| **AI vision for halal compliance verification** (no haram product in halal zone) | Industry-first; high PR value | XL | M |
| **Blockchain halal traceability** (per [ScienceDirect 2025 paper](https://www.sciencedirect.com/science/article/pii/S2590123025012083)) | Academic but credible; major B2B credential | XL | S-M |
| **Voice assistant for staff** ("Combien d'agneaux il reste au dépôt 2 ?") | Conversational ops; novel | L | S-M |

### 6.4 Skip (or wait)

- **Robotic pickers / OSP-style automation** — Ocado-only economics, requires $50M+ FC.
- **Fully cashier-less store (Amazon Go style)** — capex-heavy; only Tesco/REWE-scale players justify the Trigo / AiFi deployments.

---

## 7. Recommendations for Salamarket Stock — concrete features ranked by impact × effort

### 7.1 Ship in Q3 2026 (90 days)

1. **Per-lot traceability schema** — add `lot_id`, `supplier_lot`, `dlc`, `certifier_id` to relevant tables (`receptions_lignes` already has `lot`; need `produits_lots` join + propagation to sold lines). Foundation for everything else.
2. **DLC alerts engine** — Edge function that runs daily, surfaces upcoming expiries in `/v2/preparation` + `/v2/labo` as a banner. Easy win on waste.
3. **Customer receipt QR → traceability page** — public read-only `/lot/[id]` route on Drive showing certifier, supplier, dates. Zero competitor parity in FR halal.
4. **Bay label + counter screen** — add `pret_bay_label` to `commandes_drive`, print on receipt, render a fullscreen `/v2/counter` route showing the next 10 ready orders with bay numbers. Customer scans QR on phone → staff sees match.
5. **Tote scanning** — `commandes_drive.tote_code`; picker scans tote at start, every item scan validates against expected order. Hardware-enforced "no mixed bag".

### 7.2 Ship in Q4 2026 (next 90 days)

6. **AI demand forecasting v1** — start with one category (boucherie bœuf fresh) on one dépôt. Use `commandes_drive_lignes` history + day-of-week + Aïd/Ramadan calendar. Even a Prophet/ARIMA baseline gets 20-30% better than manual.
7. **Picker ↔ customer chat** — extends `client_notify` écart-action. WhatsApp Business API or in-app via Drive PWA.
8. **Profitability dashboard per SKU** — uplift `drive_ecarts_poids` into a manager view: actual margin after weight écarts, by SKU, by dépôt, by week.
9. **Auditor role** — `employes.role = 'auditor'` (read-only on traceability, no PII on customers). AVS/ARGML controllers can self-serve.
10. **Public halal cert status page** — per supplier, per category, with live expiry. Major trust artefact.

### 7.3 Explore in 2027

11. **CV shrinkage detection** — pilot Trigo or local equivalent on Toulouse dépôt CCTV. Capex-free integration if existing NVR works.
12. **Dynamic pricing on near-DLC** — auto-discount engine + label printing.
13. **Megabatch picker mode** — extend Batch Pick to allocate per-tote on shared pick run.
14. **NF525 alternative** — if cost or limitations of Cashmag bite, evaluate building NF525-compliant own POS module (JFT, Z closures, 6yr retention). Big undertaking; only do it if Cashmag becomes a real bottleneck.

### 7.4 Always say no to

- Robotic picking at Salamarket's scale (wrong economics).
- AR glasses (cool, no ROI at this scale).
- Forced UI updates without an opt-in transition (Square's mistake — don't repeat).
- "Generic best-in-class POS" replatform — Stock V2 already has the right opinions (PIN auth, kanban realtime, écart-action). The advantage is doubling down on halal-native features competitors won't replicate.

---

## 8. Closing Insight

The French halal grocery e-commerce field is *structurally underbuilt* on operations technology. Every public competitor scanned in this research relies on three pitches: certification badge, delivery time, price. Salamarket already has a staff app architecture (PIN auth, multi-dépôt, kanban realtime, pesée + écart-action automation) that puts it years ahead of that pack and roughly at par with the secular premium online grocery players (La Belle Vie, smaller-than-Picnic). The strategic move is **not** to chase Ocado-style robotics or Square-style flashy UI; it is to convert that operational lead into customer-visible trust artefacts:

- Per-lot halal traceability surfaced via QR — the feature *nobody* else in FR halal ships.
- Fresh-waste forecasting tuned for the halal demand cycle (Aïd, Ramadan).
- A pickup experience (bay labels, counter screen, tote scanning) that feels Carrefour-Drive-tier but in a premium halal frame.

These three together would be a genuinely defensible category position.

---

## Sources

### POS UX & benchmarking
- [POS UX Benchmarking 2026: Square, Toast, Lightspeed — interface-design.co.uk](https://interface-design.co.uk/blog/pos-software-ux-benchmarking-2026-the-coherence-gap/)
- [Toast POS Review 2026 — Research.com](https://research.com/software/reviews/toast-pos-review)
- [Avis Cashmag — Comparatif-Logiciels.fr](https://www.comparatif-logiciels.fr/logiciel/avis-cashmag/)
- [Cashmag site](https://cashmag.fr/)
- [Shopify POS Review 2026](https://www.posusa.com/shopify-pos-review/)
- [Shopify POS Hardware Guide 2026](https://www.shopify.com/blog/pos-device)
- [Filljoy Sell by Weight for Shopify POS](https://apps.shopify.com/sell-products-by-weight)

### French POS regulation
- [NF525 obligations 2025-2026 — Agiris](https://www.agiris.fr/articles/logiciel-de-caisse-certifie-nf525-lne-obligations)
- [NF525 obligations 2026 — Yzico](https://www.yzico.fr/caisse-enregistreuse-nf525-votre-guide-pour-etre-conforme-des-le-1er-janvier-2026/)
- [Certification logiciel de caisse — economie.gouv.fr](https://www.economie.gouv.fr/entreprises/gerer-son-entreprise-au-quotidien/gerer-sa-comptabilite-et-ses-demarches/ce-quil-faut-savoir-sur-la-certification-des-logiciels-de-caisse)
- [POS certification deadline extension August 2026 — Fiskaly](https://www.fiskaly.com/blog/pos-software-certification-france-deadline-extension-august-2026)
- [Tactill: loi norme caisses 2026](https://www.tactill.com/blog/loi-norme-des-caisses-2026-ce-qui-change-vraiment/)

### Picking, fulfillment, dark stores
- [Instacart Fulfillment Pro expansion 2026](https://company.instacart.com/enterprise-blog/expanding-fulfillment-pro-with-new-picking-and-delivery-solutions)
- [Instacart Partner Pick docs](https://docs.instacart.com/storefront/learn_about_your_storefront/fulfillment/partner_pick/)
- [The Shelby Report: Instacart Fulfillment Pro 2026-05](https://theshelbyreport.com/2026/05/14/instacart-expands-fulfillment-pro-with-new-picking-delivery-tools/)
- [Chain Store Age: Instacart fulfillment update](https://chainstoreage.com/instacart-updates-fulfillment-platform-delivery-picking-tools)
- [IEEE Spectrum: The Algorithms That Make Instacart Roll](https://spectrum.ieee.org/the-algorithms-that-make-instacart-roll)
- [UXCam: Flink vs Gorillas app analysis](https://uxcam.com/blog/app-analysis-gorillas-flink/)
- [Miracuves: How Gorillas works](https://miracuves.com/blog/what-is-gorillas-and-how-does-it-work/)
- [Picnic Tech jobs / engineering](https://jobs.picnic.app/en/tech)
- [Picnic Operations](https://jobs.picnic.app/en/operations)
- [About Picnic](https://jobs.picnic.app/en/about-picnic)
- [La Belle Vie Crunchbase profile](https://www.crunchbase.com/organization/la-belle-vie)
- [TechCrunch: La Belle Vie $28M round 2021](https://techcrunch.com/2021/12/16/la-belle-vie-raises-28-million-to-build-an-online-supermarket-from-scratch/)
- [TechCrunch: La Belle Vie 2018](https://techcrunch.com/2018/05/19/la-belle-vie-wants-to-compete-with-amazon-prime-now-in-paris/)
- [Ocado Group technology](https://www.ocadogroup.com/about-us/our-technology)
- [Ocado Customer Fulfilment Centres](https://www.ocadogroup.com/our-solutions/online-grocery/fulfilment/customer-fulfilment-centres)
- [Tharsus on Ocado robots](https://tharsus.com/projects/ocado/)

### Halal certification
- [AVS halal certification](https://avs.fr/en/halal-certification/)
- [About AVS](https://avs.fr/en/about-avs/)
- [AVS Wikipedia](https://en.wikipedia.org/wiki/AVS_(halal_certification))
- [ARGML halal certification](https://argml.com/en/halal-certification/)
- [ARGML meat certification](https://argml.com/en/halal-certification/meat/)
- [ARGML processed products](https://argml.com/en/halal-certification/meat-products/)
- [ARGML home](https://argml.com/en/)
- [Halal Foundation: certification by country](https://halalfoundation.org/halal-certification-requirements-by-country/)
- [CrescentRating](https://crescentrating.com/)
- [CrescentRating Wikipedia](https://en.wikipedia.org/wiki/CrescentRating)
- [Blockchain halal traceability — ScienceDirect 2025](https://www.sciencedirect.com/science/article/pii/S2590123025012083)

### Butcher / HACCP traceability software (FR)
- [Alamana: Traçabilité boucherie](https://alamana.fr/logiciel-tracabilite-boucherie/)
- [LN Software: traçabilité alimentaire](https://lnsoftware.fr/logiciel-tracabilite-alimentaire)
- [LN Software: MaBoucherie](https://lnsoftware.fr/maboucherie)
- [AEB halal-ready WMS](https://www.aeb.com/en/warehouse-management-software/halal-supply-chain-software.php)
- [Tool-Advisor: 19 logiciels boucherie 2026](https://tool-advisor.fr/metier/boucherie/)
- [SafetyCulture: applications traçabilité alimentaire](https://safetyculture.com/fr/applis/applications-de-tracabilite-alimentaire)
- [Octopus HACCP: tableau DLC](https://octopus-haccp.com/tableau-de-suivi-des-dlc-en-restauration/)

### AI demand forecasting, waste, shrinkage
- [Bright Minds AI: grocery demand forecasting](https://thebmai.com/blog/ai-forecasting-supermarket-chains)
- [Bright Minds AI: ultimate guide](https://thebmai.com/blog/grocery-demand-forecasting-the-ultimate)
- [OrderGrid: AI demand forecasting case study](https://www.ordergrid.com/case-studies/from-stockouts-to-success-a-grocery-chain-cuts-waste-and-grows-sales-with-ai)
- [OrderGrid: food retail forecasting](https://www.ordergrid.com/blog/from-stockouts-to-smart-inventory-how-ai-demand-forecasting-drives-profit-in-food-retail)
- [Afresh: forecasting fresh](https://www.afresh.com/resources/forecasting-fresh-why-every-grocery-store-needs-ai)
- [Impact Analytics: AI demand forecasting & food waste](https://www.impactanalytics.ai/blog/how-ai-powered-demand-forecasting-helps-win-the-fight-against-food-waste)
- [Trigo Retail: CV loss prevention launch](https://www.trigoretail.com/trigo-retail-launches-computer-vision-ai-powered-loss-prevention-solution/)
- [Trigo Retail home](https://www.trigoretail.com/)
- [Retail Insight Network: Trigo AI](https://www.retail-insight-network.com/news/trigo-vision-ai-retail-theft/)
- [Medium: Race to cashier-less checkout](https://medium.com/@jinghanhao/the-race-to-cashier-less-check-out-experiences-660e712a9b02)

### French halal e-commerce competitors
- [halal-store.fr](http://halal-store.fr/)
- [halalmarket.fr / market-halal.com](https://halalmarket.fr/)
- [Amanbox](https://amanbox.fr/)
- [Coq D'Or Shop](https://coqdor.shop/)
- [Halalcourses](https://halalcourses.com/)
- [Halal Frais](https://halalfrais.fr/)
- [Halal Distrib](https://halaldistrib.com/)
- [Mahalle](https://mahalle.fr/)
- [Halbutche](https://www.halbutche.fr/)
- [Dogal Food (wholesale)](https://www.dogalfood.fr/)

### Click & collect / pickup verification
- [Shopify: managing pickup in store orders](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/order-management/pickup-in-store-for-online-orders)
- [Tesco Click+Collect FAQ](https://www.tesco.com/help/pages/online-grocery-faqs/collecting-your-order-and-delivery-issues/using-click-collect-locations-that-need-a-smartphone)
- [NewStore: Click and Collect guide](https://www.newstore.com/articles/click-and-collect/)
- [DoorDash: merchant-to-Dasher pickup verification](https://help.doordash.com/en-us/dashers/article/merchant-to-dasher-pickup-verification)
