# Stagios — Contexte projet pour Claude Code

## Ce qu'est ce projet
Outil HTML standalone de recherche de stage, alternance et emploi pour adultes en formation professionnelle. Créé **par** Florent HOGUIN, élève en TP TIP à OFIAQ Montpellier, pour sa classe et ses camarades de formation.

- **Florent** = l'élève créateur du projet, pas le formateur
- **`professeurs.html`** = dashboard destiné au formateur (l'enseignant), pas à Florent

Hébergé sur GitHub Pages : `https://toolfy-tech.github.io/Stagios/`
Repo GitHub : `https://github.com/Toolfy-Tech/Stagios`

---

## État actuel du fichier principal

Fichier : `index.html` (environ 61 Ko, standalone, zéro dépendance sauf pdf.js CDN)

### Ce qui fonctionne
- ✅ 4 onglets : Profil / Radar / Suivi / Email
- ✅ Scan CV (PDF via pdf.js + TXT) → préremplissage automatique du profil (prénom, nom, email, tél, adresse, formation, compétences)
- ✅ Sélecteur d'objectif : Stage non rémunéré / Stage rémunéré / Alternance / Emploi CDI-CDD
- ✅ Sélecteur de formation (10 formations + Custom) avec config OSM/NAF par métier
- ✅ Secteurs supplémentaires personnalisés (tags)
- ✅ Codes NAF supplémentaires manuels
- ✅ Moteur de recherche configurable (Google, Bing, DDG, Qwant, Ecosia, Brave)
- ✅ Radar géographique (Overpass OSM + SIRENE API Entreprises + La Bonne Alternance)
- ✅ Distances calculées avec tiers : 🏠<5km 🚶5-15km 🚌15-30km 🚗30-50km
- ✅ Blacklist 🚫 (masquer une structure, modal de restauration)
- ✅ CRM Kanban 6 colonnes (À contacter / Envoyé / Relance / Entretien / Refus / Accepté)
- ✅ Alerte J+7 sur les envois sans réponse
- ✅ Génération email adaptée au mode (stage/alternance/emploi) + CV
- ✅ Bouton 🔍 (moteur configuré) + 🔗 LinkedIn + 🏢 Offres (France Travail) sur chaque fiche
- ✅ Badge 🟢 "Offre alternance" sur fiches La Bonne Alternance
- ✅ Export CSV + sauvegarde/restauration JSON
- ✅ Mode sombre/clair

### Ce qui est cassé (à corriger en priorité)
- ❌ `saveProfile()` manquante dans le JS principal (le fichier a été fragmenté lors de patches successifs)
- ❌ `launchRadar()` manquante
- ❌ `renderKanban()` manquante
- Le fichier a 2 blocs `<script>` : pdf.js CDN + le script principal. Le script principal est incomplet — il manque environ 300 lignes de fonctions core.

---

## Architecture JS (sections dans l'ordre)

```
FORMATION_CONFIG    — 10 formations avec OSM amenities, offices, NAF codes, keywords
SEARCH_ENGINES      — moteurs de recherche + searchUrl(query)
MODE CONFIG         — getMode(), onModeChange(), getFranceTravailUrl(), getModeLabel()
BLACKLIST           — _blacklist Set, blacklist(), unblacklist(), showBlacklistedModal()
FORMATION CATS      — activateFormationCats(formationId)
CV SCAN             — handleCvUpload(), extractPdfText(), autofillFromCv(), setField()
PERSIST             — persist(), restore() (localStorage)
GEOCODAGE           — onAddrInput(), fetchSugg(), selectAddr(), gpsLocate(), haversine(), dist(), tier()
APIs RADAR          — fetchOverpass(lat,lng,rm,amenities,offices,keywords)
                    — fetchEntreprises(lat,lng,rKm,nafCodes,keywords)
                    — fetchAlternance(lat,lng,rKm)
                    — fetchFranceTravail(lat,lng,rKm,nafCodes,keywords)
RADAR               — launchRadar(), renderRadar(), radarCard(c)
CRM                 — addToSuivi(), setStatus(), daysSince(), renderKanban()
EMAIL               — buildEmail(c,ct), refreshEmailList(), renderEmail(), copyEmail()
                    — openEmailFor(), markEmailSent(), openLinkedInFor()
PROFIL              — saveProfile(), showPbar(), fillProfileForm(), onFormationChange()
                    — addCustomSector(), removeSector(), renderSectorTags()
EXPORT/IMPORT       — exportCSV(), exportJSON(), importJSON()
INIT IIFE           — loadBlacklist(), applyTheme(), buildCatGrid(), onModeChange()
```

---

## Variables globales clés

```javascript
let S = {};              // Profil étudiant (prenom, nom, tel, email, etab, formation,
                         // formationLabel, formationDiploma, formationEmoji,
                         // mode, searchEngine, nafExtra, customSectors,
                         // debut, fin, comp, motiv, cvText, cvFileName)
let coords = null;       // {lat, lng} position GPS/adresse
let radarResults = [];   // Résultats du scan (tableau de company objects)
let crmData = {};        // {[id]: {status, sentDate, notes, contact}}
let activeCats = new Set(); // Catégories radar actives
let emailCompanyId = null;
let emailVariant = 0;
let radarRunning = false;
let _blacklist = new Set();
let _customSectors = [];
let _lastAddrForCoords = '';
```

---

## Structure d'un objet company (radarResults)

```javascript
{
  id: 'osm_123' | 'ent_456' | 'alt_789',  // préfixe selon la source
  n: 'Nom de l\'entreprise',
  t: 'ESN' | 'Public' | 'Santé' | 'Education' | 'Lycées' | 'Banque' |
     'Industrie' | 'Garage' | 'Commerce' | 'Restauration' | 'Social' |
     'Logistique' | 'Coworking' | 'Médias' | 'PME' | 'Asso',
  v: 'adresse ou ville',
  d: 'description (type OSM ou NAF code)',
  e: 'email@contact.fr',    // peut être vide
  web: 'https://...',       // peut être vide
  lat: 43.610,
  lng: 3.877,
  src: 'OpenStreetMap' | 'Annuaire Entreprises' | 'La Bonne Alternance',
  disc: true,               // découvert via API (pas pré-chargé)
  alt: true,                // vient de La Bonne Alternance (offre alternance)
  hasOffer: true,           // a une offre active connue
  _dist: 2.4,              // calculé par haversine(), null si pas de coords
}
```

---

## FORMATION_CONFIG — structure par formation

```javascript
FORMATION_CONFIG.TIP = {
  label: 'Technicien Informatique de Proximité',
  emoji: '💻',
  diploma: 'Titre Professionnel TIP',
  sectors: ['ESN','Public','Education','Lycées','Santé','Banque','Industrie','Coworking'],
  osmAmenities: ['hospital','clinic','school','college','university','townhall','bank','coworking_space'],
  osmOffices: ['government','it','company'],
  nafCodes: ['6202A','6202B','6203Z','6209Z','9511Z','6190Z'],
  skills: 'support N1/N2, helpdesk, Windows 10/11, Active Directory, GLPI, TCP/IP',
  keywords: ['informatique','numérique','helpdesk','DSI','support','réseau']
}
// Même structure pour : Compta, Mecanique, Secretariat, Commerce,
// Electro, BTP, Restauration, Social, Logistique, Custom
```

---

## APIs utilisées

| API | URL | Auth | Notes |
|-----|-----|------|-------|
| Overpass (OSM) | `https://overpass-api.de/api/interpreter` | Non | Fonctionne depuis HTTPS uniquement |
| API Adresse | `https://api-adresse.data.gouv.fr/search/` | Non | Fonctionne partout |
| Annuaire Entreprises | `https://recherche-entreprises.api.gouv.fr/search` | Non | Public |
| La Bonne Alternance | `https://labonnealternance.apprentissage.beta.gouv.fr/api/v1/jobs/matcha` | Non | |
| Nominatim | `https://nominatim.openstreetmap.org/search` | Non | Fallback géocodage |
| France Travail | `https://candidat.francetravail.fr/offres/recherche` | Non (deep link) | Lien externe uniquement |

**Important** : Les APIs ne fonctionnent PAS depuis `file://` (CORS null origin). Elles fonctionnent uniquement depuis une URL HTTPS (GitHub Pages).

---

## Ce qui reste à faire

### Priorité 1 — Bugs critiques
- [ ] **Reconstruire proprement le JS** : saveProfile(), launchRadar(), renderKanban() sont manquantes suite à des patches cassés. Le plus propre serait de réécrire le fichier entier proprement plutôt que de patcher encore.

### Priorité 2 — Fonctionnalités
- [ ] Templates email spécifiques par formation (Mécanique, Compta, etc.) — actuellement un seul template générique `buildEmail()` avec branche par type de structure
- [ ] Filtrage PRELOADED par formation (actuellement PRELOADED=[])
- [ ] Dashboard professeur (`professeurs.html`) — tableau de bord pour suivre tous les élèves

### Priorité 3 — Future migration Flutter
- Repo app Flutter : `https://github.com/Toolfy-Tech/Eskolia`
- Stack : Flutter Web + Firebase (Auth, Firestore, Storage) + Riverpod + go_router + Dio
- Plan : garder le HTML standalone fonctionnel, puis réécrire en Flutter natif quand satisfait

---

## Instructions pour Claude Code

**Pour corriger le fichier cassé :**
Lis `index.html`, identifie les fonctions manquantes dans le bloc `<script>` principal, et réécris le fichier complet proprement. Ne fais pas de patches successifs — réécris directement le fichier entier avec toutes les fonctions dans le bon ordre (voir "Architecture JS" ci-dessus).

**Règles importantes :**
- Pas de `localStorage` en dehors de persist/restore et blacklist (les APIs ne fonctionnent que depuis HTTPS)
- `PRELOADED = []` — zéro entreprise pré-chargée, tout vient du scan
- `saveProfile()` doit être `async` (geocoding await)
- Tester la syntaxe JS avec `node --check` avant de commiter
- Le fichier doit être standalone (tout en un seul HTML)
