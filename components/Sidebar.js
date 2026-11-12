// La navigation de bureau : le rail (components/nav/Navigation.js). La liste
// des écrans vit dans lib/navigation.js, lue aussi par la barre du bas du
// téléphone. `_app.js` décale le contenu de SIDEBAR_WIDTH.
import Navigation from './nav/Navigation'
import { LARGEUR_RAIL } from './nav/styles'

export const SIDEBAR_WIDTH = LARGEUR_RAIL

export default Navigation
