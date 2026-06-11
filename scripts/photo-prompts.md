# Prompts photos produits — Salamarket Drive (Pollinations.ai / Flux)

Banque de prompts pour générer les **44 placeholders** du catalogue Drive
(produits dont `image_url` pointe encore sur `placehold.co`). La génération
en masse est lancée séparément (script `upload-photos-drive.mjs`, voir
section « Pipeline » en bas).

## Contraintes communes (à coller à CHAQUE prompt)

- **Moteur** : Pollinations.ai, modèle `flux`.
- **Format** : carré **1:1** (`width=1024&height=1024`).
- **Cadrage** : packshot produit centré, vue de face légèrement plongeante.
- **Fond** : uni **crème chaud** (`#FAF7EE`, le token `BRAND.colors.bg`),
  léger dégradé radial, ombre portée douce sous le produit.
- **Lumière** : studio soft, douce, pas de reflets durs.
- **Style** : photoréaliste, épicerie premium, appétissant, sans texte
  ni logo de marque inventé, sans mains, sans personnes.
- **Halal** : AUCUN alcool, AUCUN porc, aucune bouteille de bière/vin en
  arrière-plan (cf. BUG-015 — photos Unsplash polluées). Viandes =
  volaille / bœuf / agneau / mouton uniquement.

Suffixe technique à ajouter à tous les prompts :

```
, professional product packshot, centered, warm cream background #FAF7EE, soft studio lighting, subtle drop shadow, photorealistic, high detail, no text, no logo, no people, no hands, no alcohol, no pork, halal grocery, 1:1
```

URL type Pollinations (échapper les espaces en `%20`) :

```
https://image.pollinations.ai/prompt/<PROMPT_ENCODE>?model=flux&width=1024&height=1024&nologo=true&seed=<SEED>
```

---

## Boucherie (3) — viandes halal crues, planche bois clair

- **Merguez fraîches halal x10** : `ten fresh halal merguez sausages, spicy lamb and beef, coiled on a light wooden board`
- **Poulet entier halal 1.4kg** : `whole raw halal chicken, plucked, on a light wooden cutting board`
- **Viande hachée 5% halal 500g** : `500g of fresh lean halal ground beef in a black tray, 5 percent fat`

## Charcuterie (2) — charcuterie de volaille halal

- **Cordon bleu volaille halal x4** : `four breaded chicken cordon bleu, halal poultry, on a plate`
- **Saucisson dinde halal 250g** : `halal turkey dry sausage, sliced, on a wooden board`

## Boissons (6) — bouteilles/cannettes, AUCUN alcool

- **Coca-Cola Zero 1.5L** : `a 1.5L plastic bottle of cola zero soft drink, condensation droplets` *(générique cola, pas de marque déposée)*
- **Eau Cristaline 1.5L** : `a 1.5L clear plastic bottle of spring water`
- **Eau Cristaline 6×1.5L** : `a shrink-wrapped pack of six 1.5L spring water bottles`
- **Fanta Orange 1.5L** : `a 1.5L plastic bottle of orange soda, bright orange liquid`
- **Freez Mix Grenadine 275ml** : `a 275ml glass bottle of pink grenadine soft drink, no alcohol`
- **Freez Mix Litchi 275ml** : `a 275ml glass bottle of lychee flavored soft drink, no alcohol`

## Épicerie (19) — sachets, bocaux, sacs de céréales

- **Couscous moyen Dari 1kg** : `a 1kg bag of medium couscous semolina, golden grains visible`
- **Couscous royal traiteur 4 pers** : `a generous plate of royal couscous with vegetables and halal lamb and chicken, traiteur style`
- **Cumin moulu 50g** : `a small jar of ground cumin spice, warm brown powder`
- **Halawa pistache 400g** : `a block of pistachio halva, sesame paste sweet, sliced`
- **Harissa Le Phare du Cap Bon 380g** : `a jar of red harissa chili paste, Tunisian style`
- **Huile d'olive vierge extra Tunisie 1L** : `a 1L bottle of extra virgin olive oil, golden green`
- **Lentilles corail 500g** : `a 500g bag of orange red coral lentils`
- **Loukoum aux pistaches 200g** : `turkish delight loukoum cubes with pistachios, dusted with sugar`
- **Méchoui agneau préparé 2kg** : `roasted halal lamb shoulder mechoui, golden crispy, on a platter`
- **Miel de jujubier 250g** : `a glass jar of dark jujube honey, amber color`
- **Olives Picholine vrac 1kg** : `a bowl of green picholine olives in brine`
- **Pastilla poulet maison** : `a moroccan chicken pastilla, round filo pastry pie dusted with icing sugar and cinnamon`
- **Pois chiches secs 1kg** : `a 1kg bag of dried chickpeas`
- **Ras El Hanout 100g** : `a jar of ras el hanout spice blend, warm reddish brown powder`
- **Riz Basmati Tilda 5kg** : `a 5kg bag of long grain basmati rice`
- **Salade composée maison 500g** : `a fresh mixed vegetable salad in a clear deli container`
- **Semoule fine Ferrero 1kg** : `a 1kg bag of fine semolina flour`
- **Tajine agneau pruneaux 6 pers** : `a moroccan lamb tagine with prunes and almonds in a terracotta dish, halal`
- **Thé vert Sultan en vrac 250g** : `loose green gunpowder tea leaves in a bag with a scoop`

## Frais (5) — produits réfrigérés

- **Bricks Tunisiens x10** : `a stack of ten round tunisian brick pastry sheets`
- **Fromage feta 200g** : `a block of white feta cheese in a clear container`
- **Lait UHT demi-écrémé 1L** : `a 1L carton of semi-skimmed UHT milk`
- **Pâtes Filo 500g** : `a pack of thin filo pastry sheets, rolled`
- **Yaourt Activia nature x4** : `a four-pack of plain natural yogurt cups`

## Surgelé (2) — packaging givré, fond froid

- **Crevettes décortiquées surgelées 500g** : `a 500g bag of frozen peeled raw shrimp, frosty`
- **Glace Magnum Classic x4** : `a box of four classic chocolate-coated vanilla ice cream bars`

## Bazar (3) — entretien maison

- **Lessive liquide Ariel 2L** : `a 2L bottle of blue liquid laundry detergent`
- **Liquide vaisselle 750ml** : `a 750ml bottle of green dish soap`
- **Papier toilette x12 Lotus** : `a pack of twelve white toilet paper rolls`

---

## Pipeline (rappel)

1. Générer chaque image via l'URL Pollinations ci-dessus (prompt + suffixe
   commun), enregistrer en `apps/drive/public/products/<slug>.png`.
2. Renseigner le mapping correspondant dans `upload-photos-drive.mjs`
   (tableau `REPLACEMENTS`, `productId` + `localFile` + `targetPath`).
3. `node scripts/upload-photos-drive.mjs` : upload vers le bucket Storage
   `product-images/products/` + PATCH `products.image_url` vers l'URL
   publique Storage (cache-bust `?v=`).

Note : la génération en masse n'est PAS lancée par ce script — seuls les
prompts et le pipeline sont fournis ici.
