# Plan : le Globe de Prisme

Objectif : un module style « Google Earth ». Chaque nouvelle nous amène, par un zoom arrière puis un zoom avant, là où elle se passe. On y voit aussi d'où viennent les médias qui la couvrent.

Ce document sert de **point de reprise**. Chaque étape se termine par un commit poussé sur la branche. Si une session s'arrête, la suivante relit ce fichier, vérifie les cases cochées et reprend à la première case vide.

## Comment reprendre

1. `git pull`, puis `npm install`.
2. `npm test` doit passer.
3. `npm run demo && npm run serve` permet de voir le site avec les articles fictifs.
4. Reprendre à la première étape non cochée ci-dessous. Cocher la case et décrire brièvement ce qui a été fait au moment du commit de l'étape.

## Décisions de conception

| Question | Décision | Pourquoi |
|---|---|---|
| Bibliothèque | **MapLibre GL 6**, projection `globe`, copiée dans `dist/vendor/` au moment de la construction | Libre (BSD), sans clé. Son `flyTo` fait exactement l'arc « zoom arrière, survol, zoom avant ». Aucune dépendance à un CDN. |
| Fond de carte | **Style maison en deux couches** : (1) terres et frontières Natural Earth intégrées au site, toujours disponibles, aux couleurs du thème clair ou sombre ; (2) détails OpenFreeMap (eau, routes, noms de lieux) ajoutés par-dessus quand on zoome, s'ils sont joignables | Lisible et cohérent avec le site. Le globe fonctionne même si le fournisseur de tuiles tombe. |
| Imagerie satellite | Pas pour l'instant (étape optionnelle 7) | Conditions d'utilisation plus restrictives, lisibilité moindre. |
| Points sur le globe | Cercles (taille selon le nombre de sources), sans texte | Pas de dépendance aux polices de tuiles. Un clic sur un endroit chargé liste toutes les histoires qui s'y trouvent. |
| Nouvelles sans lieu précis | Placées sur le **pays principal** s'il est connu, sinon **absentes du globe** | Mieux vaut pas de point qu'un point faux. |
| Lieu d'une histoire | Géocodage dans la chaîne de traitement : répertoire GeoNames et Natural Earth, noms français et anglais, choix du lieu le plus précis et le plus cité par l'ensemble des articles | Gratuit, déterministe, testable. |
| Arcs de couverture | Arcs de grand cercle depuis la ville-siège de chaque pays de média vers le lieu, colorés selon l'orientation | Rend visible « qui couvre, et d'où ». |
| Mouvement réduit | `prefers-reduced-motion` : on saute directement au lieu, sans vol | Accessibilité. |

## Données et licences

- **GeoNames**, via le paquet npm `all-the-cities` : villes, population, coordonnées. Licence CC BY 4.0, avec mention dans la page Sources.
- **Natural Earth**, via `world-atlas` : contours des pays (domaine public).
- **i18n-iso-countries** : noms des pays en français et en anglais (MIT).
- **OpenFreeMap / OpenStreetMap** : tuiles de détail. Mention « © OpenStreetMap » affichée sur la carte.

Le répertoire de lieux est généré une fois par `npm run gazetteer` et versionné (`config/gazetteer.json`). La construction de chaque actualisation n'a donc pas besoin de ces paquets.

## Étapes

### Étape 0 — Plan
- [x] Ce document.

### Étape 1 — Répertoire de lieux (`scripts/build-gazetteer.js` → `config/gazetteer.json`)
- [x] Pays : centre et emprise tirés de Natural Earth, avec repli sur la capitale. Noms FR et EN, gentilés.
- [x] Provinces et États (Canada, États-Unis, Australie) : centre pondéré par la population des villes, noms FR.
- [x] Villes : population d'au moins 100 000 dans le monde, d'au moins 5 000 au Canada, et toutes les capitales.
- [x] Ajouts manuels (`config/places-extra.json`) :
  - exonymes français (Londres, Pékin, Le Caire…) ;
  - lieux québécois ;
  - métonymies (Kremlin, Maison-Blanche, colline du Parlement…) ;
  - liste noire des faux amis (Nice, Mobile, Reading, Sale, Tours…).
- [x] Tests sur le contenu du répertoire.
- Fait : 5 083 lieux (245 pays, 72 provinces et États, 4 722 villes, 44 régions), 5 395 noms, 560 Ko. Régénérer avec `npm run gazetteer` après toute modification de `config/places-extra.json`.

### Étape 2 — Géocodage des histoires (`src/pipeline/places.js`)
- [ ] Repérage des lieux, du nom le plus long au plus court, avec majuscule exigée dans le texte original.
- [ ] Désambiguïsation :
  - « au Québec » désigne la province, « à Québec » la ville ;
  - London (Ontario) l'emporte si l'Ontario est cité ;
  - sinon, la plus grande population.
- [ ] Pondération : titre plus que description, ville plus que province plus que pays plus que métonymie. Bonus quand la ville et son pays sont tous deux cités.
- [ ] Agrégation par histoire : `story.place = { name, lat, lon, kind, country, zoom }`, plus `story.places` (jusqu'à 3 lieux).
- [ ] Statistiques dans le journal de construction : pourcentage d'histoires localisées, par précision.
- [ ] Tests, dont les fixtures avec le lieu attendu.

### Étape 3 — Le globe (`public/globe.js`, route `#/globe`)
- [ ] Copie de MapLibre dans `dist/vendor/maplibre/` et chargement à la demande.
- [ ] Style maison : `dist/data/world.json` (Natural Earth) aux couleurs du thème, plus les détails OpenFreeMap.
- [ ] Points des histoires, vol vers l'histoire choisie, carte de l'histoire superposée (titre, barre d'orientation, sources, lien vers la comparaison).
- [ ] Clic sur un endroit chargé : liste des histoires à cet endroit.
- [ ] Onglet « Globe ».

### Étape 4 — Visite guidée et navigation
- [ ] Boutons précédent et suivant, lecture automatique (une histoire toutes les 8 secondes, barre de progression), pause.
- [ ] Clavier : ← → pour naviguer, espace pour lire ou mettre en pause, Échap pour arrêter.
- [ ] Filtre par région ou thème.
- [ ] Lien profond `#/globe/<id>`.
- [ ] Panneau en bas de l'écran sur mobile.

### Étape 5 — Arcs de couverture et liens depuis les histoires
- [ ] Arcs de grand cercle depuis la ville-siège de chaque pays de média, colorés selon l'orientation, avec légende.
- [ ] Dans la page d'une histoire : nom du lieu et bouton « Voir sur le globe ».

### Étape 6 — Finition
- [ ] Mode sombre, mouvement réduit, mentions de licences, README, vérification sur mobile et ordinateur, captures.

### Étape 7 — Optionnel, plus tard
- [ ] Couche satellite activable, si une source aux conditions compatibles est confirmée.
- [ ] Mini-carte dans chaque page d'histoire.
- [ ] Lieu affiné par l'IA quand une clé API est configurée (nom renvoyé par le modèle, coordonnées par le répertoire).

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `scripts/build-gazetteer.js` | Génère `config/gazetteer.json` à partir des paquets npm de données |
| `config/places-extra.json` | Exonymes, lieux québécois, métonymies, faux amis (modifiable à la main) |
| `config/gazetteer.json` | Répertoire généré et versionné |
| `src/pipeline/places.js` | Géocodage des articles et des histoires |
| `public/globe.js` | Vue Globe (chargée à la demande) |
| `src/build.js` | Copie de MapLibre et du fond de carte dans `dist/` |
