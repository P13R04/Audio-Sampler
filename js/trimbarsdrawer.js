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
        // couleur adaptée au thème violet-cyan
        color: "#a78bfa",
        selected: false,
        dragged: false
    }
    rightTrimBar = {
        x: 0,
        color: "#67e8f9",
        selected: false,
        dragged: false
    }

    constructor(canvas, leftTrimBarX, rightTrimBarX) {
        this.canvas = canvas;
        this.leftTrimBar.x = leftTrimBarX;
        this.rightTrimBar.x = rightTrimBarX;
        this.ctx = canvas.getContext('2d');
    }

    // Efface complètement le canvas
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    draw() {
        let ctx = this.ctx;

        // Good practice: always save the context state before drawing
        ctx.save();

    // largeur de trait pour les barres
    ctx.lineWidth = 3;

        // bande semi-transparente moderne autour des barres
        const drawBand = (x, selected, color) => {
            const bw = 20;
            if (selected) {
                ctx.fillStyle = "rgba(253, 224, 71, 0.15)"; // jaune doux quand sélectionné
            } else {
                // Utilise la couleur de la barre avec opacité
                const rgb = color === "#a78bfa" ? "167, 139, 250" : "103, 232, 249";
                ctx.fillStyle = `rgba(${rgb}, 0.08)`;
            }
            ctx.fillRect(x - bw/2, 0, bw, this.canvas.height);
        };

    drawBand(this.leftTrimBar.x, this.leftTrimBar.selected, this.leftTrimBar.color);
    ctx.strokeStyle = this.leftTrimBar.color;
        ctx.beginPath();
        // start
        ctx.moveTo(this.leftTrimBar.x, 0);
        ctx.lineTo(this.leftTrimBar.x, this.canvas.height);
        ctx.stroke();

        // end
    drawBand(this.rightTrimBar.x, this.rightTrimBar.selected, this.rightTrimBar.color);
    ctx.beginPath();
    ctx.strokeStyle = this.rightTrimBar.color;
        ctx.moveTo(this.rightTrimBar.x, 0);
        ctx.lineTo(this.rightTrimBar.x, this.canvas.height);
        ctx.stroke();

    // poignées triangulaires
    const handleSize = 16;
    const handleHeight = 24;
    
    ctx.fillStyle = this.leftTrimBar.color;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(this.leftTrimBar.x, 0);
    ctx.lineTo(this.leftTrimBar.x + handleSize, handleHeight / 2);
    ctx.lineTo(this.leftTrimBar.x, handleHeight);
    ctx.fill();
    
    ctx.shadowBlur = 0;

    ctx.fillStyle = this.rightTrimBar.color;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(this.rightTrimBar.x, 0);
    ctx.lineTo(this.rightTrimBar.x - handleSize, handleHeight / 2);
    ctx.lineTo(this.rightTrimBar.x, handleHeight);
    ctx.fill();
    
    ctx.shadowBlur = 0;

    // On dessine des rectangles gris translucides avant la barre gauche
    // et après la barre droite pour indiquer la zone non sélectionnée
    ctx.fillStyle = "rgba(128, 128, 128, 0.7)"
        ctx.fillRect(0, 0, this.leftTrimBar.x, this.canvas.height);
        ctx.fillRect(this.rightTrimBar.x, 0, this.canvas.width, this.canvas.height);

        // Good practice: always restore the context state after drawing
        ctx.restore();
    }

    // Met en évidence la barre de trim proche du pointeur et change le curseur
    highLightTrimBarsWhenClose(mousePos) {
        // calcule la distance entre la souris et la barre gauche
        // zone de sélection agrandie pour meilleure ergonomie
        let d = distance(mousePos.x, mousePos.y, this.leftTrimBar.x + 10, 10);

    // Si la souris est proche d'une barre (et que l'autre n'est pas sélectionnée),
    // on change sa couleur et on marque la propriété `selected`.
        if ((d < 24) && (!this.rightTrimBar.selected)) {
            this.leftTrimBar.color = "#fde047"; // jaune au survol
            this.leftTrimBar.selected = true;
        } else {
            this.leftTrimBar.color = "#a78bfa"; // violet par défaut
            this.leftTrimBar.selected = false;
        }

    // idem pour la barre droite
        d = distance(mousePos.x, mousePos.y, this.rightTrimBar.x - 10, 10);
        if ((d < 24) && (!this.leftTrimBar.selected)) {
            this.rightTrimBar.color = "#fde047"; // jaune au survol
            this.rightTrimBar.selected = true;
        } else {
            this.rightTrimBar.color = "#67e8f9"; // cyan par défaut
            this.rightTrimBar.selected = false;
        }

    // Change le curseur pour indiquer la manipulation horizontale
        if (this.leftTrimBar.selected || this.rightTrimBar.selected) {
            this.canvas.style.cursor = 'ew-resize';
        } else {
            this.canvas.style.cursor = 'default';
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
