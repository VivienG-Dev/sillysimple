# Crediting the people who wrote a card

A card's file name is its id: lowercase letters, digits and dashes only (`ayaka.png`, not
`main_ayaka_spec_v2.png`). Any other name is skipped, with a warning in the console.

Some of the cards in this folder are shared by their authors on the promise that they are
always credited. The credit is read from the card itself, so it travels with it:

```json
{
  "spec": "chara_card_v2",
  "data": {
    "name": "…",
    "creator": "Their name, as they want it shown",
    "extensions": {
      "sillysimple": { "creatorLink": "https://their-page.example" }
    }
  }
}
```

- `creator` is the standard field of every card format: SillyTavern and chub.ai show it too.
- `creatorLink` is optional, the app's own (card formats have no field for a link). Only an
  `http(s)` address is used; it opens in the browser.
- For a `.png` card, the same JSON is the one inside the picture.

Where the credit shows: the "Ready to play" gallery (Library), the first-launch choice,
the character panel next to the chat, the hover of the card in the Library, and
Settings › Help › Credits, which lists every author of the cards in this folder with
the characters they wrote. Editing a character in the app keeps its creator.

## Partner pages

A partner gets a small page in the app (Library › "by …", or Settings › Help › Credits).
It is written in `scenarios/authors/authors.json`, one entry per partner:

```json
[
  {
    "name": "SzainX",
    "about": "A few words about them, as they want them. Line breaks are kept.",
    "links": ["https://chub.ai/users/szainx", { "label": "Ko-fi", "url": "https://ko-fi.com/…" }],
    "picture": "szainx.png",
    "banner": "szainx-banner.png"
  }
]
```

- `name` is the only field needed, and must be the `creator` of their cards (case and
  accents do not matter): that is how the page finds their characters.
- `links`: up to 4, https only. An address alone is labelled with the site's name.
- `picture`: a .png, .jpg or .webp file in `scenarios/authors/`. Without one, their initials.
- `banner`: a wide picture across the top of their page (about 2.5 times as wide as tall), same
  formats, same folder. Their picture then sits on its lower edge. Optional.
- An author who is not in this file is still credited ("by …"), just without a page.
