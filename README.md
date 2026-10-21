# Mon plan de révision

Appli web installable (PWA) : matières, chapitres, répétition espacée, planning de la semaine, minuteur 50 + 10 min, et abonnement calendrier pour l'iPhone.
Next.js · Supabase (données + connexion) · Vercel (hébergement).

Compte 20 minutes la première fois. De préférence sur un ordinateur.

---

## 1. Supabase (la base de données) — gratuit

1. Crée un compte sur **supabase.com**, puis **New project** (choisis la région *Europe*, garde le mot de passe quelque part).
2. Dans le projet : **SQL Editor › New query**, colle tout le contenu de `supabase/schema.sql`, clique **Run**.
3. **Authentication › Sign In / Providers › Email** : laisse *Email* activé.
4. **Project Settings › API** : note deux valeurs
   - *Project URL*
   - *anon public* key

## 2. GitHub

Mets ce dossier dans un dépôt **privé** (sur github.com : *New repository* › *uploading an existing file*, puis glisse tout le contenu du dossier, sauf `node_modules` s'il existe).

## 3. Vercel (l'hébergement) — gratuit

1. Sur **vercel.com**, connecte-toi avec GitHub › **Add New › Project** › choisis le dépôt.
2. Avant de cliquer sur *Deploy*, ouvre **Environment Variables** et ajoute :

| Nom | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | la *Project URL* |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clé *anon public* |
| `NEXT_PUBLIC_SEED_EMAIL` | ton adresse e-mail (pour récupérer tes données actuelles) |
| `APP_TIMEZONE` | `Europe/Paris` |

3. **Deploy**. Tu obtiens une adresse du type `https://plan-revision-xxx.vercel.app`.

## 4. Sur l'iPhone

1. Ouvre l'adresse dans **Safari** › bouton **Partager** › **Sur l'écran d'accueil**.
2. Ouvre l'appli depuis l'écran d'accueil › *Créer mon compte* (e-mail + mot de passe) › appuie sur le lien de confirmation reçu par e-mail › reviens dans l'appli et connecte-toi.
   Au premier passage, l'appli reprend automatiquement tes données actuelles (chapitres, dates, semaine en cours) si l'e-mail correspond à `NEXT_PUBLIC_SEED_EMAIL`.
3. **Calendrier** : bouton **📅 Calendrier** dans l'appli › *Ajouter à mon calendrier*.
   Le jour en cours est fixe ; les jours suivants sont marqués « (prévu) ». L'iPhone se met à jour tout seul (en général toutes les heures ; réglable dans *Réglages › Calendrier › Comptes › Récupérer les données*).

Tu peux ensuite ouvrir la même adresse sur ton ordinateur : connecte-toi avec le même e-mail, tout est synchronisé.

---

## Pour modifier l'appli

- `lib/planner.js` : la logique de planification (priorités, étapes, durées). Utilisée par l'appli **et** par le calendrier.
- `lib/app.js` : l'interface (les 6 étapes, le minuteur, les fenêtres).
- `app/api/ics/[token]/route.js` : le flux calendrier.
- `seed/initial-state.json` : tes données au moment de la création du projet (importées une seule fois).

En local : `npm install`, copie `.env.example` en `.env.local` et remplis-le, puis `npm run dev`.

## Sécurité

- Chaque compte ne voit que ses propres données (règles *Row Level Security* dans `schema.sql`).
- Le flux calendrier lit ton plan via une fonction SQL qui exige le jeton secret exact : aucune clé secrète n'est stockée dans l'appli.
- Le lien calendrier contient un jeton secret : ne le partage pas.
