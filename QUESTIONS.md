# Writing Noggin questions

All questions live in `data.js`. Season 2 started Wednesday, Nov 25, 2026: that is Day 1, and Day N is Nov 24, 2026 plus N days, using each player's local date. Scores are stored under day N + 100 so last season's scores stay off the boards.
If a day has no entry yet, the game loops back to older days, so always keep at least a week of future days filled in.

After any change, run `node tools/check.js`. It must print `All good`.

## Daily Trivia (`TRIVIA`)

Each day is one array of 9 questions, appended in order: `TRIVIA[N-1]` is Day N.

Format: `["scene", "Question text?", "Shown answer|also accepted|also accepted"]`

Category order every day:
1. `football` (NFL or college football)
2. `baseball`
3. `basketball`
4. `hockey`
5. `geography`
6. `movies` or `tv` (alternate days)
7. `food` (food and drink)
8. `history`
9. `science` or `music` (alternate days)

Rules:
- One clear, checkable answer. No opinions, no "best", no answers that could have changed recently.
- Avoid stats or records that may have changed after mid-2026 unless the question is about a fixed past event (for example a specific season or year).
- Medium difficulty, like the Daily Dozen: something a sports fan or a well-read adult can get, with a mix of easy and hard. A couple of New England or Boston questions per week are welcome.
- List common spellings and short forms as accepted answers (team nickname alone, last name alone when it is unambiguous). Small typos are already accepted automatically.
- Never repeat a question that already appears in `data.js`, including `ARCHIVE` (last season).
- Use curly quotes and apostrophes (“ ” ’) inside question text so the JavaScript strings stay valid.

## Long Shot (`LONGSHOT` and `LSDAYS`)

`LONGSHOT` is a bank of open prompts. Format:
`["scene", "group", "Name a ...", "entry;entry;entry", "object"]`

The optional fifth field picks what gets launched down the field: football, baseball, basketball, puck, golf, can, apple, globe, coin, vinyl or reel. Without it the scene decides.

- Groups: `s` sports, `g` geography, `p` pop culture and food, `x` science and body, `h` history and local.
- Each entry is `Shown name|alias|alias`.
- Start an entry with `*` if it is one of the first answers most people would say, `+` if it is common, nothing if it is normal, and `-` if it is obscure. Every list needs a few `*` entries. These guesses set the odds until real players fill in the crowd.
- Prefer prompts whose full answer list is known and finite (teams, states, elements, national parks). Open prompts (fruit, dog breeds) are fine if the list is generous (40+ entries).
- Every list needs at least 12 answers. Lists with 19 or more are also used in the Hot Seat party game.
- Only include answers that are definitely correct. A missing answer is better than a wrong one.

`LSDAYS[N-1]` is Day N: 7 prompt numbers from the bank. Mix the groups each day, with roughly 1–2 sports, 1–2 geography, 2 pop culture or food, 1 science, and 1 history or local. New prompts are appended to the end of `LONGSHOT` so existing numbers never change. A prompt can come back after at least 6 weeks.
