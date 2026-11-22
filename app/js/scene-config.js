// =====================================================================
// Réglages de la scène du bivouac (Aujourd'hui). Modifiable SANS toucher au code : pivots, amplitudes, durées.
//   - Coordonnées = pixels de l'image de fond (base.w × base.h). Changer de fond (ex. 2752 × 1536) = changer `base`
//     ET les positions (scene-positions.js).
//   - Pivot = point de rotation / d'étirement, en % de l'image de l'animal ('50% 100%' = milieu du bas).
//   - Durées en millisecondes, angles en degrés.
//   - Les images facultatives (yeux fermés, ours en deux morceaux, étincelle) sont utilisées si le fichier existe,
//     ignorées sinon : il suffit de déposer le fichier dans src/assets/scenes/<jour|nuit>/.
// =====================================================================
window.B = window.B || {};
B.SCENE_CONFIG = {
  base: { w: 2000, h: 1116 },
  folder: 'assets/scenes',
  // Fond : image pleine taille, ou la version légère (-1000) quand la scène s'affiche sur 1100 pixels réels ou moins
  background: { jour: 'camp-jour', nuit: 'camp-nuit', small: '-1000', smallUnder: 1100 },
  // Écran plus étroit que le fond : on recadre autour de ce point (le feu), placé à cet endroit de l'écran
  focal: { x: 1150, y: 900 },
  focalOnScreen: { x: 0.5, y: 0.72 },
  crossfadeMs: 1500, // passage jour ↔ nuit (toute la scène en fondu)

  // Respiration : étirement vertical léger, pivot en bas
  breath: { scaleY: 1.012, minMs: 3500, maxMs: 4500 },

  animals: {
    ours: {
      breath: true,
      // Tête et bras de l'ours (si ours-corps.webp + ours-tete-bras.webp existent) : tourne de ±3° (jamais plus de ±5°)
      split: { body: 'ours-corps', head: 'ours-tete-bras', pivot: '60% 75%', angle: 3, minMs: 6000, maxMs: 9000 }
    },
    renard: { breath: true, turn: { angle: 2, pivot: '50% 50%', minMs: 7000, maxMs: 11000 } },
    marmotte: { breath: true },
    chamois: { breath: true, turn: { angle: 2, pivot: '50% 50%', minMs: 8000, maxMs: 12000 } },
    // Hibou : tourne la tête par à-coups (250 ms), puis reste immobile 2 à 5 s
    hibou: { breath: true, jerk: { angle: 8, pivot: '50% 50%', moveMs: 250, minStill: 2000, maxStill: 5000 } },
    // Écureuils : petit sursaut (2 px vers le haut, 120 ms) toutes les 2 à 6 s, avec ±2° de rotation
    ecureuil: { twitch: { lift: 2, angle: 2, pivot: '50% 100%', ms: 120, minGap: 2000, maxGap: 6000 } },
    'ecureuil-1': { twitch: { lift: 2, angle: 2, pivot: '50% 100%', ms: 120, minGap: 2000, maxGap: 6000 } },
    'ecureuil-2': { twitch: { lift: 2, angle: 2, pivot: '50% 100%', ms: 120, minGap: 2000, maxGap: 6000 } }
  },

  // Clignement : seulement si <animal>-yeux-fermes.webp existe. 140 ms en tout, toutes les 3 à 7 s, parfois double.
  blink: { ms: 140, minGap: 3000, maxGap: 7000, doubleChance: 0.25 },

  fire: {
    jour: { x: 1135, y: 925, h: 120, opacity: 0.6, glow: false, sparks: 0 },
    nuit: { x: 1160, y: 930, h: 210, opacity: 1, glow: true, sparks: 14 },
    files: ['flammes-1', 'flammes-2'], // 3 ou 4 variantes possibles ; une seule = étirement + opacité seulement
    swapMinMs: 300, swapMaxMs: 500,  // fondu entre deux variantes
    scaleMin: 0.97, scaleMax: 1.04,  // étirement vertical, pivot en bas
    // Lueur sur le sol et les objets (nuit) : dégradé calculé, pas d'image
    glow: { radius: 654, blend: 'screen', base: 0.35, min: 0.28, max: 0.42 }, // blend : 'screen' ou 'soft-light'
    // Étincelles : montent en dérivant, puis s'effacent (texture 'etincelle.webp' si elle existe, sinon points orange)
    spark: { texture: 'etincelle', rise: [150, 320], drift: 45, minMs: 1400, maxMs: 2800, size: [4, 9] }
  }
};
