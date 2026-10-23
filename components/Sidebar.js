// La navigation de bureau. Pendant la refonte, elle se décline en trois essais
// (components/nav/Navigation.js) ; la liste des écrans vit dans
// lib/navigation.js, lue aussi par la barre du bas du téléphone.
//
// `_app.js` pose encore la marge de l'ancienne barre (SIDEBAR_WIDTH) ; chaque
// essai la remplace par sa propre largeur. Une fois l'essai choisi, _app lira
// la largeur retenue et cette constante pourra suivre.
import Navigation from './nav/Navigation'

export const SIDEBAR_WIDTH = 224

export default Navigation
