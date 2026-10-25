# sarulloengineering.com

Sito di presentazione di **Ing. Antonino Sarullo — Sarullo Engineering**, in italiano, inglese e russo.

Il sito è scritto a mano in HTML, CSS e JavaScript puri: nessun framework, nessun CMS, nessun passaggio di build. Quello che c'è nel repository è esattamente quello che viene pubblicato.

## Struttura

```
/
├── index.html          Sceglie la lingua (scelta salvata o lingua del browser) e reindirizza
├── 404.html            Pagina "non trovata" nelle tre lingue
├── CNAME               Dominio personalizzato per GitHub Pages
├── .nojekyll           Dice a GitHub Pages di pubblicare i file così come sono
├── robots.txt
├── sitemap.xml         Include i collegamenti hreflang tra le lingue
├── it/                 Versione italiana
│   ├── index.html      Home a pagina unica: hero, chi sono, competenze, passioni, contatti
│   └── privacy.html
├── en/                 Versione inglese (stessi file)
├── ru/                 Versione russa (stessi file)
└── assets/
    ├── css/style.css   Unico foglio di stile per tutte le pagine
    ├── js/main.js      Lingua scelta, anno nel footer
    ├── js/lattice.js   Animazione dell'hero: reticolo → rete neurale → logo (canvas, senza librerie)
    ├── fonts/          Commissioner (testi) e Cormorant Garamond (marchio e titoli), latino + cirillico, licenza OFL
    └── img/            logo.svg (principale), logo-negativo.svg, favicon.svg/png, apple-touch-icon.png, og-image.png
brand/                  Il marchio da scaricare: SVG e PNG 2000 px (principale, positivo, monocromo, negativo)
```

## Regole di lavoro

- **Ogni modifica di contenuto va fatta in tutte e tre le lingue**: `it/`, `en/`, `ru/` hanno la stessa struttura HTML, cambiano solo i testi. Gli `id` delle sezioni (`#about`, `#skills`, `#passions`, `#contact`) sono uguali ovunque.
- **Una nuova pagina** si crea in tutte e tre le cartelle, con i tag `hreflang` aggiornati, e si aggiunge a `sitemap.xml`.
- **Percorsi assoluti** (`/assets/...`): per provare il sito in locale serve un piccolo server, non basta aprire il file con doppio clic:
  ```
  python3 -m http.server 8000
  ```
  poi apri http://localhost:8000
- **Colori e misure** sono definiti una volta sola in cima a `style.css` (`:root`).
- **Nessuna risorsa esterna** (Google Fonts, analytics, CDN): così il sito non ha bisogno di banner cookie.

## Pubblicazione (GitHub Pages)

1. Repository → *Settings* → *Pages* → *Source*: **Deploy from a branch**, branch `main`, cartella `/ (root)`.
2. *Custom domain*: `sarulloengineering.com` (già scritto nel file `CNAME`).
3. Presso il registrar del dominio, crea questi record DNS:
   - 4 record **A** per `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - 1 record **CNAME** per `www` → `tonynos89.github.io`
4. Quando GitHub ha verificato il dominio, attiva **Enforce HTTPS**.

## Da completare

- [ ] Partita IVA nel footer delle tre home, quando ci sarà — cercare `TODO`
- [ ] Link al profilo LinkedIn nella sezione contatti — cercare `TODO`
- [ ] Attivare la casella `antonino@sarulloengineering.com`
- [ ] Far rileggere i testi russi da un madrelingua
- [ ] Far verificare l'informativa privacy
- [ ] Foto per la sezione "Chi sono": salvarla come `assets/img/foto.jpg` e sostituire il logo nella `figure.portrait` delle tre home (istruzione nel commento HTML)

## Il marchio

| Variante | File | Quando usarla |
| --- | --- | --- |
| Filo d'argento (principale) | `brand/logo.svg` | Ovunque: sito, documenti, LinkedIn. Va su fondo chiaro e scuro |
| Positivo | `brand/logo-positivo.svg` | Fondo bianco, carta intestata |
| Monocromo | `brand/logo-monocromo.svg` | Stampa a un colore, incisioni, timbri |
| Negativo | `brand/logo-negativo.svg` | Fondi navy o scuri (retro del biglietto, icona iPhone) |
| Essenziale | `assets/img/favicon.svg` | Solo A e S: icona del browser e misure piccolissime |

Colori: navy `#14213D`, argento `#C3CAD3`, ardesia `#34426B`, fondo del sito `#0B1424`.
Caratteri: Cormorant Garamond per il marchio e i titoli, Commissioner per i testi.
