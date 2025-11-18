import { distance } from './utils.js';

/* ---------------------------------------------------------------------------
    TrimbarsDrawer
    Classe responsable du rendu et de l'interaction des barres de trim (gauche/droite)
    - Dessine les barres, leurs bandes semi-transparentes, et les poignées
    - Gère le survol (changement de couleur), le drag & drop avec bornage
    - Fournit une API simple utilisée par le code principal:
            trimbarsDrawer.moveTrimBars(mousePos)
            trimbarsDrawer.startDrag()
            trimbarsDrawer.stopDrag()
    Les coordonnées internes sont en pixels canvas (0..width)
    --------------------------------------------------------------------------- */
export default class TrimbarsDrawer {
    leftTrimBar = {
        x: 0,
        color: null, // sera définie dynamiquement depuis le thème
        selected: false,
        dragged: false
    }
    rightTrimBar = {
        x: 0,
        color: null, // sera définie dynamiquement depuis le thème
        selected: false,
        dragged: false
    }

    constructor(canvas, leftTrimBarX, rightTrimBarX) {
        this.canvas = canvas;
        this.leftTrimBar.x = leftTrimBarX;
        this.rightTrimBar.x = rightTrimBarX;
        this.ctx = canvas.getContext('2d');
        // Initialiser les couleurs depuis le thème
        this.updateColorsFromTheme();
    }

    // Met à jour les couleurs depuis les variables CSS du thème
    updateColorsFromTheme() {
        const cs = getComputedStyle(this.canvas || document.documentElement);
        const leftDefault = (cs.getPropertyValue('--wave-grad-1') || '#a78bfa').trim();
        const rightDefault = (cs.getPropertyValue('--wave-grad-3') || '#67e8f9').trim();
        
        // Mettre à jour les couleurs sauf si une barre est sélectionnée
        if (!this.leftTrimBar.selected) {
            this.leftTrimBar.color = leftDefault;
        }
        if (!this.rightTrimBar.selected) {
            this.rightTrimBar.color = rightDefault;
        }
    }

    // Efface complètement le canvas
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    draw() {
        let ctx = this.ctx;

        // Bonne pratique : sauvegarder l'état du contexte avant de dessiner
        ctx.save();

        // Mettre à jour les couleurs depuis le thème avant de dessiner
        this.updateColorsFromTheme();

        // Lecture des couleurs du thème depuis les variables CSS
        let cs = getComputedStyle(this.canvas || document.documentElement);
        const leftDefault = (cs.getPropertyValue('--wave-grad-1') || '#a78bfa').trim();
        const rightDefault = (cs.getPropertyValue('--wave-grad-3') || '#67e8f9').trim();

        // Largeur de trait pour les barres
        ctx.lineWidth = 3;

        // Dessine les lignes de trim gauche et droite (traits simples, sans bandes)
        const leftColor = this.leftTrimBar.selected ? '#fde047' : (this.leftTrimBar.color || leftDefault);
        const rightColor = this.rightTrimBar.selected ? '#fde047' : (this.rightTrimBar.color || rightDefault);

        // Configuration du triangle - démarre en haut du canvas
        const dpr = this.canvas.ownerDocument.defaultView.devicePixelRatio || 1;
        const triHalfW = Math.max(6, Math.round(8 * dpr));
        const triH = Math.max(8, Math.round(10 * dpr));
        const triBaseY = -1; // commence légèrement au-dessus pour fusionner avec le haut
        const triTipY = triBaseY + triH;
        const barWidth = Math.max(2, Math.round(4 * dpr));

    // On dessine d'abord les rectangles gris translucides (en arrière-plan)
    // avant la barre gauche et après la barre droite pour indiquer la zone non sélectionnée
    // Couvre toute la hauteur du canvas (incluant les zones de padding)
    ctx.fillStyle = "rgba(128, 128, 128, 0.25)";
    ctx.fillRect(0, 0, this.leftTrimBar.x, this.canvas.height);
    ctx.fillRect(this.rightTrimBar.x, 0, this.canvas.width - this.rightTrimBar.x, this.canvas.height);

    // Barre gauche : trait vertical du haut en bas - couvre toute la hauteur
    ctx.fillStyle = leftColor;
    ctx.fillRect(Math.round(this.leftTrimBar.x - barWidth/2), 0, Math.round(barWidth), this.canvas.height);

    // Barre gauche : triangle en haut (positionné au niveau de la waveform visible)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = Math.max(2, Math.round(3 * dpr));
    ctx.beginPath();
    ctx.moveTo(this.leftTrimBar.x - triHalfW, triBaseY);
    ctx.lineTo(this.leftTrimBar.x + triHalfW, triBaseY);
    ctx.lineTo(this.leftTrimBar.x, triTipY);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Barre droite : trait vertical du haut en bas - couvre toute la hauteur
    ctx.fillStyle = rightColor;
    ctx.fillRect(Math.round(this.rightTrimBar.x - barWidth/2), 0, Math.round(barWidth), this.canvas.height);

    // Barre droite : triangle en haut (positionné au niveau de la waveform visible)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = Math.max(2, Math.round(3 * dpr));
    ctx.beginPath();
    ctx.moveTo(this.rightTrimBar.x - triHalfW, triBaseY);
    ctx.lineTo(this.rightTrimBar.x + triHalfW, triBaseY);
    ctx.lineTo(this.rightTrimBar.x, triTipY);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

        // Bonne pratique : toujours restaurer l'état du contexte après dessin
        ctx.restore();
    }

    // Met en évidence la barre de trim proche du pointeur et change le curseur
    highLightTrimBarsWhenClose(mousePos) {
        // calcule la distance entre la souris et la zone haute (triangle) des trimbars
        const dpr = this.canvas.ownerDocument.defaultView.devicePixelRatio || 1;
        const triH = Math.max(8, Math.round(10 * dpr));
        const triCenterY = Math.round(triH / 2);
        // zone de sélection agrandie pour meilleure ergonomie (en pixels)
        let hoverRadius = Math.round(18 * dpr);
        let d = distance(mousePos.x, mousePos.y, this.leftTrimBar.x, triCenterY);

    // Si la souris est proche d'une barre (et que l'autre n'est pas sélectionnée),
    // on change sa couleur et on marque la propriété `selected`.
            // Détermine les couleurs du thème (valeurs par défaut)
            const cs = getComputedStyle(this.canvas || document.documentElement);
            const leftDefault = (cs.getPropertyValue('--wave-grad-1') || '#a78bfa').trim();
            const rightDefault = (cs.getPropertyValue('--wave-grad-3') || '#67e8f9').trim();

            if ((d < hoverRadius) && (!this.rightTrimBar.selected)) {
                this.leftTrimBar.color = "#fde047"; // jaune au survol
                this.leftTrimBar.selected = true;
            } else if (!this.leftTrimBar.dragged) {
                this.leftTrimBar.color = leftDefault; // couleur du thème par défaut
                this.leftTrimBar.selected = false;
            }

    // idem pour la barre droite
        d = distance(mousePos.x, mousePos.y, this.rightTrimBar.x, triCenterY);
        if ((d < hoverRadius) && (!this.leftTrimBar.selected)) {
            this.rightTrimBar.color = "#fde047"; // jaune au survol
            this.rightTrimBar.selected = true;
        } else if (!this.rightTrimBar.dragged) {
            this.rightTrimBar.color = rightDefault; // couleur du thème par défaut
            this.rightTrimBar.selected = false;
        }

    // Change le curseur pour indiquer la manipulation horizontale
        if (this.leftTrimBar.selected || this.rightTrimBar.selected) {
            this.canvas.classList.add('resize-cursor');
        } else {
            this.canvas.classList.remove('resize-cursor');
        }
    }

    // Débute le drag (appelé au mousedown)
    startDrag() {
        if (this.leftTrimBar.selected)
            this.leftTrimBar.dragged = true;

        if (this.rightTrimBar.selected)
            this.rightTrimBar.dragged = true;
    }

    // Termine le drag (appelé au mouseup) et applique des bornes de sécurité
    stopDrag() {
        // Si la barre gauche était en drag, on la remet en état non-drag
        if (this.leftTrimBar.dragged) {
            this.leftTrimBar.dragged = false;
            this.leftTrimBar.selected = false;

            // Limite la barre gauche à rester à gauche de la barre droite
            // (parfois, si la souris se déplace trop vite, on peut se retrouver à droite de la barre droite)
            if (this.leftTrimBar.x > this.rightTrimBar.x)
                this.leftTrimBar.x = this.rightTrimBar.x;
        }

        if (this.rightTrimBar.dragged) {
            this.rightTrimBar.dragged = false;
            this.rightTrimBar.selected = false;

            // Limite la barre droite à rester à droite de la barre gauche
            if (this.rightTrimBar.x < this.leftTrimBar.x)
                this.rightTrimBar.x = this.leftTrimBar.x;
        }
    }


    // Gère le déplacement des barres lors du mouvement de la souris
    // - met à jour la sélection au survol
    // - si une barre est en drag, met à jour sa position tout en la bornant
    moveTrimBars(mousePos) {
        this.highLightTrimBarsWhenClose(mousePos);

        // On borne la position de la souris au canvas
        const mx = Math.min(Math.max(mousePos.x, 0), this.canvas.width);

        if (this.leftTrimBar.dragged) {
            // limite gauche ≤ droite
            if (this.leftTrimBar.x < this.rightTrimBar.x)
                this.leftTrimBar.x = mx;
            else {
                if (mx < this.rightTrimBar.x)
                    this.leftTrimBar.x = mx;
            }
        }

        if (this.rightTrimBar.dragged) {
            // limite droite ≥ gauche
            if (this.rightTrimBar.x > this.leftTrimBar.x)
                this.rightTrimBar.x = mx;
            else {
                if (mx > this.rightTrimBar.x)
                    this.rightTrimBar.x = mx;
            }
        }
    }
}
