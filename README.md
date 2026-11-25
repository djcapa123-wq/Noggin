# Noggin

Test your noggin. A daily trivia site with three games:

- **Daily Trivia**: nine category questions a day. The clock counts up, and fast right answers earn a speed bonus.
- **Long Shot**: seven open prompts a day. Any right answer counts, and rarer answers pay more.
- **Hot Seat**: a live party game. Name an answer and pass the whoopee cushion before it blows.

There are also daily leaderboards, friends (add by code) with streaks and totals, and usernames tied to each device. Players can move to a new phone with their device key.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The game |
| `data.js` | All questions (see `QUESTIONS.md`) |
| `net.js` | Online features: Firebase sign-in, leaderboards, friends, party rooms |
| `firebase-config.js` | Your Firebase web config |
| `firestore.rules` | Security rules to paste into Firebase |
| `tools/check.js` | Checks `data.js` before publishing: `node tools/check.js` |

## Setup

1. Paste your Firebase web config into `firebase-config.js`.
2. In Firebase: turn on **Firestore** and **Authentication → Anonymous**. Paste `firestore.rules` into **Firestore → Rules** and publish. Add your GitHub Pages domain under **Authentication → Settings → Authorized domains**.
3. In GitHub: **Settings → Pages → Deploy from a branch → main / (root)**.

Without a Firebase config the game still works on its own, with scores saved only on that device.
