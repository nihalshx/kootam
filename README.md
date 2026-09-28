# Kootam 🔥

A private chat app for you and your friends: live messages, groups, read ticks, typing, online status and daily chat streaks.

- **Website:** React + Vite
- **Backend:** Supabase project `friends-chat` (Mumbai), already set up
- **Hosting:** Vercel

## 1. One setting in Supabase (important)

Supabase → your **friends-chat** project → **Authentication** → **Sign In / Providers** → **Email** → turn **off** “Confirm email” → Save.

Without this, friends get a confirmation email first, and Supabase's free email service only sends a few per hour.

## 2. Put the code on GitHub

1. Go to github.com → **New repository** → name it `kootam` → Create.
2. On the empty repo page click **uploading an existing file**.
3. Unzip this folder on your computer and drag **everything inside it** (not the folder itself) into the page.
4. Click **Commit changes**.

## 3. Deploy on Vercel

1. Go to vercel.com → sign in with GitHub.
2. **Add New… → Project** → pick `kootam` → **Import**.
3. Vercel detects Vite automatically. Click **Deploy**.
4. After about a minute you get a link like `kootam.vercel.app`. Share it with your friends.

Every time you change a file on GitHub, Vercel redeploys automatically.

## How streaks work

In a chat, when **everyone** sends at least one message on the same day (Indian time), the streak goes up by 1. Miss a full day and it resets. A ⏳ appears when today still needs messages to keep it going.

## Run on your own computer (optional)

```
npm install
npm run dev
```
