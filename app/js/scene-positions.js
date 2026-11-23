// Positions des animaux sur le fond : { x, y, w, h } = coin en haut à gauche, largeur, hauteur, en pixels de l'image
// de fond (B.SCENE_CONFIG.base). Même structure que le positions.json prévu ; un animal absent ici n'est pas affiché.
// Ordre = ordre d'empilement (le dernier est devant).
// Ours : posé pour que ses FESSES soient sur le rondin (pas le bout des pattes), 23/11.
window.B = window.B || {};
B.SCENE_POSITIONS = {
  jour: {
    hibou: { x: 1234, y: 342, w: 57, h: 110 },
    chamois: { x: 650, y: 594, w: 132, h: 150 },
    ecureuil: { x: 845, y: 778, w: 70, h: 70 },
    ours: { x: 1285, y: 602, w: 230, h: 330 },
    marmotte: { x: 958, y: 832, w: 54, h: 102 },
    renard: { x: 506, y: 858, w: 90, h: 150 }
  },
  nuit: {
    hibou: { x: 1224, y: 342, w: 76, h: 110 },
    chamois: { x: 626, y: 524, w: 127, h: 150 },
    ecureuil: { x: 575, y: 798, w: 70, h: 70 },
    ours: { x: 1508, y: 581, w: 214, h: 330 },
    marmotte: { x: 857, y: 828, w: 46, h: 100 },
    renard: { x: 424, y: 860, w: 93, h: 150 }
  }
};
