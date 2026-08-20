# Ajouter une langue

Le logiciel se règle en 25 langues : les 24 officielles de l'Union européenne,
qui couvrent ses 27 États membres, plus le norvégien. Une langue par tenant
(`tenants.locale`, réglée dans ST-01) : agents et clients d'un même espace de
travail lisent la même, il n'y a ni préférence individuelle ni préfixe d'URL.

`fr.ts` est la source. Les autres dictionnaires sont typés dessus, si bien
qu'une clé oubliée est une erreur de compilation. C'est la seule garantie que le
compilateur apporte — tout le reste de cette page décrit ce qu'il ne voit pas.

## La marche à suivre

1. Ajouter l'entrée dans [`locales.ts`](locales.ts) : `code`, `tag` BCP-47,
   `nativeName` dans la langue elle-même, `dir`.
2. Écrire `dictionaries/<code>.ts`, calqué sur `fr.ts` — mêmes clés, même ordre,
   mêmes repères de section. Une relecture se fait alors en diff côte à côte.
3. L'importer dans [`server.ts`](server.ts) et l'ajouter à `DICTIONARIES`.
4. Lancer les contrôles : `pnpm --filter @openhelpdesk/smoke exec playwright test
   src/i18n-source.spec.ts` — il ne demande aucune instance.

## Les quatre pièges, tous vérifiés par des tests

**Les formes de pluriel.** `Message` n'exige que `other` ; les autres sont
optionnelles, puisque aucune langue n'utilise le même jeu. Un dictionnaire
polonais amputé de sa forme `many` compile sans un mot et affiche une phrase
fausse dès qu'un compteur passe à 5. Fournissez toutes les catégories que
`new Intl.PluralRules(tag).resolvedOptions().pluralCategories` renvoie ; le
`many` du tchèque, du slovaque et du lituanien est la seule exception admise
(il ne vise que les décimaux, qu'aucun `{count}` du produit ne reçoit).

**Les noms propres non déclinés.** Le produit interpole les noms tels qu'ils
ont été saisis, au nominatif : il ne sait pas en fabriquer le génitif, y coller
un suffixe casuel, ni assimiler un article. Une phrase qui l'exigerait est
fausse à chaque affichage — le tchèque écrivait « Odpověď od Petr » au lieu de
« od Petra ». Trente clés sont concernées, et elles seules : celles dont un
paramètre reçoit `name`, `org`, `agent`, `contact`, `tenant`, `domain`,
`subject`, `team` ou `title`. Les parades éprouvées, par ordre de préférence :
un nom commun qui porte le cas devant le nom propre (« Kontakty organizace
{org} », « l-organizzazzjoni {org} »), la phrase retournée pour faire du
paramètre un sujet, ou le détachement typographique (« agent: {agent} »). Et
méfiez-vous des accords que le paramètre commande sans qu'on y pense : le croate
accordait un participe avec le nom de l'agent, faux pour toute agente.

**Les verbes destructeurs qui se confondent.** Dans quatre des quatorze
dernières langues livrées, le mot naturel de la révocation était aussi celui de
l'annulation : le lien rouge qui invalide définitivement une clé d'API portait le
même mot que le bouton Annuler du même écran. Vérifiez que « révoquer »,
« supprimer », « désactiver », « retirer », « fermer » et « annuler » restent
distinguables **quand ils cohabitent sur un écran** ; ailleurs, un seul mot est
souvent légitime.

**Les jeux de vocabulaire.** Statuts, priorités, urgences, canaux vivent dans des
tables à l'écart des écrans qui les affichent, et deux valeurs identiques dans un
même jeu donnent un filtre inutilisable sans que rien ne plante. Attention aussi
au genre : les statuts du portail qualifient une « demande », ceux de l'espace
agent un « ticket », et ces deux mots n'ont pas forcément le même genre.

## Ce qui n'est pas à traduire

Les marques et les sigles techniques, les touches de clavier (`⌘K`, `↑↓`, `↵` —
dans « G puis B », seul le mot de liaison change), les `{{jetons.doubles}}` des
macros, les chemins de consoles tierces non localisées, et les rôles affichés du
produit : **Owner, Admin, Agent, Viewer** sont des valeurs, pas du texte.

En revanche, adaptez les unités, les domaines d'exemple, les jours fériés cités
et les initiales des jours de la semaine de la heatmap.

Un piège technique : l'exemple de `app.settings.sla.durationHint` est relu par
`parseDurationFr`, qui n'accepte littéralement que `min`, `h` et `j` quelle que
soit la langue. Gardez ces jetons analysables et glosez-les.

## Formats : ne les écrivez pas, déléguez-les

Dates, heures, nombres, pluriels et temps relatif passent par `Intl` via
[`LocaleFormat`](format.ts). Un nombre interpolé dans une phrase est formaté par
`interpolate` avec la locale : ne le mettez pas en dur. Les langues ne groupent
pas les milliers de la même façon, et certaines ne les groupent pas du tout à
quatre chiffres — le polonais écrit « 4262 » là où le français écrit « 4 262 ».

`of()` est le seul endroit où une règle de langue est codée en dur : l'élision
française (« le support d'Acme »). Les autres langues reçoivent le nom tel quel
et leur dictionnaire tourne la phrase.
