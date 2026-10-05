# Website-inspired app design

Reference: https://www.basketballexperience.ca/ (reviewed September 28, 2026).

The app now uses the website's sky blue (#38b6ff), white and charcoal direction, condensed headings, the website logo, and a basketball training photograph. Desktop navigation runs horizontally; compact screens retain the app menu. Native screens use the same palette and bundled images with platform condensed fonts. Existing workflows remain in place.

Web production build passed. Browser checks covered the desktop home screen and 390px phone layout without horizontal page overflow. The earlier native build blocker is resolved: the branded iOS and Android JavaScript bundles now compile successfully. Native appearance and hardware behavior remain unverified.

Assets copied from the user-provided reference website for this requested application:
- Logo: https://static.wixstatic.com/media/9cf442_e758572bdc92403bbeea3c4dd198e449~mv2.png
- Training photo: https://static.wixstatic.com/media/9cf442_dab0d8584e644b35b54dd4007452d700~mv2.jpg

Web headings use Oswald through Google Fonts, with local font fallbacks. Native headings use platform fonts and do not require a font network request.
