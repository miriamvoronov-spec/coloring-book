/** Original logo: an open coloring book with a pencil drawing a trail of stardust. */

export function logoMark(size = 220): string {
  return `
<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 240 240" role="img" aria-label="לוגו Miriam Coloring Books">
  <defs>
    <linearGradient id="lg-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff4c8"/><stop offset=".5" stop-color="#f0c766"/><stop offset="1" stop-color="#b98a33"/>
    </linearGradient>
    <linearGradient id="lg-cover" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2d3f86"/><stop offset="1" stop-color="#18234f"/>
    </linearGradient>
    <linearGradient id="lg-pageL" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fbf1dc"/><stop offset=".8" stop-color="#fffaf0"/><stop offset="1" stop-color="#e9d6b0"/>
    </linearGradient>
    <linearGradient id="lg-pageR" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#fbf1dc"/><stop offset=".8" stop-color="#fffaf0"/><stop offset="1" stop-color="#e9d6b0"/>
    </linearGradient>
    <linearGradient id="lg-pencil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c9b3ff"/><stop offset=".5" stop-color="#9d7ae6"/><stop offset="1" stop-color="#6f4fc2"/>
    </linearGradient>
    <linearGradient id="lg-dust" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#f0c766" stop-opacity=".2"/><stop offset=".4" stop-color="#ffe7a0"/><stop offset="1" stop-color="#fff8e0"/>
    </linearGradient>
    <radialGradient id="lg-glow" cx=".5" cy=".55" r=".5">
      <stop offset="0" stop-color="#ffdf92" stop-opacity=".35"/><stop offset="1" stop-color="#ffdf92" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="120" cy="140" rx="112" ry="96" fill="url(#lg-glow)"/>
  <ellipse cx="120" cy="196" rx="92" ry="9" fill="#000" opacity=".25"/>
  <!-- covers -->
  <path d="M120 188 C 96 172, 52 170, 12 180 L 12 92 C 50 80, 92 82, 120 98 Z" fill="url(#lg-cover)" stroke="url(#lg-gold)" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M120 188 C 144 172, 188 170, 228 180 L 228 92 C 190 80, 148 82, 120 98 Z" fill="url(#lg-cover)" stroke="url(#lg-gold)" stroke-width="2.4" stroke-linejoin="round"/>
  <!-- page block -->
  <g fill="none" stroke="#d9c49b" stroke-width="1.2">
    <path d="M120 182 C 96 166, 56 164, 20 172"/><path d="M120 179 C 96 163, 56 161, 21 169"/>
    <path d="M120 182 C 144 166, 184 164, 220 172"/><path d="M120 179 C 144 163, 184 161, 219 169"/>
  </g>
  <!-- pages -->
  <path d="M120 176 C 96 160, 58 158, 22 166 L 22 88 C 56 78, 94 80, 120 96 Z" fill="url(#lg-pageL)" stroke="#cfb07a" stroke-width="1.2"/>
  <path d="M120 176 C 144 160, 182 158, 218 166 L 218 88 C 184 78, 146 80, 120 96 Z" fill="url(#lg-pageR)" stroke="#cfb07a" stroke-width="1.2"/>
  <path d="M120 96 L 120 176" stroke="#c9a36a" stroke-width="1.4" opacity=".7"/>
  <!-- a little castle to colour by numbers on the left page -->
  <g stroke="#3b2a1e" stroke-width="1.5" stroke-linejoin="round" fill="none">
    <path d="M64 104 L72 86 L80 104 Z" fill="#f7a8c4"/>
    <rect x="65" y="104" width="14" height="44" fill="#fff"/>
    <path d="M47 114 L54 100 L61 114 Z" fill="#fff"/>
    <rect x="48" y="114" width="12" height="34" fill="#a9d4f5"/>
    <path d="M83 114 L90 100 L97 114 Z" fill="#fff"/>
    <rect x="84" y="114" width="12" height="34" fill="#fff"/>
    <rect x="60" y="126" width="24" height="22" fill="#fff"/>
    <path d="M67.5 148 v-9 a4.5 4.5 0 0 1 9 0 v9" fill="#fff"/>
    <path d="M72 86 v-7 l7 2.5 -7 2.5"/>
  </g>
  <g font-family="Fredoka, 'Varela Round', sans-serif" font-weight="700" font-size="7" fill="#3b2a1e" text-anchor="middle">
    <text x="72" y="119">3</text><text x="90" y="111">1</text><text x="90" y="133">2</text><text x="64" y="136">4</text><text x="72" y="136">4</text>
  </g>
  <!-- stardust ribbon rising from the pencil tip -->
  <path d="M142 132 C 150 112, 176 124, 178 104 C 180 86, 160 84, 168 68 C 176 52, 200 56, 206 40" fill="none" stroke="url(#lg-dust)" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M142 132 C 150 112, 176 124, 178 104 C 180 86, 160 84, 168 68 C 176 52, 200 56, 206 40" fill="none" stroke="#fffbe8" stroke-width="1" stroke-linecap="round" opacity=".8"/>
  <g fill="#fff3c4">
    <path class="logo-star s1" d="M206 26 l3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 9 -3z"/>
    <path class="logo-star s2" d="M182 84 l2 5.5 5.5 2 -5.5 2 -2 5.5 -2 -5.5 -5.5 -2 5.5 -2z"/>
    <path class="logo-star s3" d="M156 98 l1.6 4.4 4.4 1.6 -4.4 1.6 -1.6 4.4 -1.6 -4.4 -4.4 -1.6 4.4 -1.6z"/>
    <circle cx="190" cy="62" r="1.6"/><circle cx="170" cy="112" r="1.3"/><circle cx="214" cy="54" r="1.2"/><circle cx="160" cy="76" r="1.1"/>
  </g>
  <!-- coloured pencil resting on the right page -->
  <g transform="translate(142 134) rotate(38)">
    <path d="M0 0 L12 -5.5 L12 5.5 Z" fill="#f3d9a4"/>
    <path d="M0 0 L5 -2.3 L5 2.3 Z" fill="#7a55d0"/>
    <rect x="12" y="-5.5" width="62" height="11" fill="url(#lg-pencil)"/>
    <path d="M12 -1.8 H74 M12 1.8 H74" stroke="#5a3ea8" stroke-width=".6" opacity=".5"/>
    <rect x="74" y="-5.5" width="7" height="11" fill="url(#lg-gold)"/>
    <rect x="81" y="-5.5" width="6" height="11" rx="2" fill="#6f4fc2"/>
  </g>
</svg>`;
}

export function logoFull(size = 220): string {
  return `<div class="logo">${logoMark(size)}<div class="logo-word" dir="ltr">Miriam<span>Coloring Books</span></div></div>`;
}
