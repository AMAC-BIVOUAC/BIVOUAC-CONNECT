// Positions des personnages sur le fond : { x, y, w, h } = coin en haut à gauche, largeur, hauteur, en pixels de l'image
// de fond (B.SCENE_CONFIG.base). Un personnage absent ici n'est pas affiché. Ordre = ordre d'empilement (le dernier est devant).
// 24/11 (Apo) : fonds épurés, animaux retirés pour l'instant. L'humain est assis sur le tronc de droite, le robot (en miroir)
// sur celui de gauche : tous deux regardent le feu. Couleurs un peu moins pastel que les originaux (+18 % de saturation). Fesses posées sur le dessus du tronc, pieds au sol.
// 26/11 (Amaury) : humain décalé vers la droite (+65 px) et un peu plus bas, assis sur la bûche et non plus devant :
// son pied ne touche plus les pierres du feu.
window.B = window.B || {};
B.SCENE_POSITIONS = {
  jour: {
    robot: { x: 752, y: 594, w: 165, h: 280 },
    humain: { x: 1343, y: 573, w: 213, h: 391 }
  },
  nuit: {
    robot: { x: 750, y: 590, w: 178, h: 280 },
    humain: { x: 1344, y: 577, w: 210, h: 384 }
  }
};
