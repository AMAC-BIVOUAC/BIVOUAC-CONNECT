// Positions des personnages sur le fond : { x, y, w, h } = coin en haut à gauche, largeur, hauteur, en pixels de l'image
// de fond (B.SCENE_CONFIG.base). Un personnage absent ici n'est pas affiché. Ordre = ordre d'empilement (le dernier est devant).
// 24/11 (Apo) : fonds épurés, animaux retirés pour l'instant. L'humain est assis sur le tronc de droite, le robot (en miroir)
// sur celui de gauche : tous deux regardent le feu. Couleurs un peu moins pastel que les originaux (+18 % de saturation). Fesses posées sur le dessus du tronc, pieds au sol.
window.B = window.B || {};
B.SCENE_POSITIONS = {
  jour: {
    robot: { x: 752, y: 594, w: 165, h: 280 },
    humain: { x: 1278, y: 558, w: 213, h: 391 }
  },
  nuit: {
    robot: { x: 750, y: 590, w: 178, h: 280 },
    humain: { x: 1279, y: 562, w: 210, h: 384 }
  }
};
