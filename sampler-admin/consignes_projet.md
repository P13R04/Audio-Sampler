M1 INFO 2025-2026 / Projet Sampler Audio / Angular


FRENCH VERSION
Voici le travail attendu avec des parties obligatoires et des parties optionnelles.

A FAIRE EN BINÔME. Indiquer qui a fait quoi dans le README
DATE DE RENDU : XXX (mais d’ici 3 semaines environs, la date sera définitivement fixée ce lundi)
MODALITÉS
Repo GitHub avec README détaillé, indiquez ce que vous avez fait avec de l’IA (indiquer les parties, les gros prompts, les outils utilisés).
Toute feature moins bien que vue en cours et généré par IA enlève des points.
Toute feature optionnelle non documentée enlève des points.
Si le projet est hébergé quelque part : bonus !


Je me réserve la possibilité de vous convoquer pour démos + questions et demandes d’explications.

FRONT-END (sampler)
Vous utiliserez un back-end NodeJS qui propose une API pour les presets, comme vu en cours. Bien entendu vous pouvez le personnaliser avec vos propres fonctionnalités customs.
Séparer GUI et moteur audio. La page HTML que vous proposerez pour tester votre sampler devra comporter un test en mode “headless” (sans GUI).
Le sampler devra proposer un menu de presets construit dynamiquement par envoi d’une requête sur le back-end via une requête fetch GET.
Optionnel : proposer des catégories de presets (drums, pianos, etc. je vous avais donné un exemple en cours, il est sur le repository GitHub du cours)
Lorsqu’on choisit un preset, les sons se chargent et sont affectés aux différents pads. Le pad 0 qui correspond, si on a un kit de batterie, au son “kick” (grosse caisse) sera en bas à gauche, le son snare (caisse claire) juste à sa droite, etc. 
Lors du chargement des presets on a des barres de progression animées (voir exemples dans le repository GitHub).
Une fois les sons chargés, si on clique sur un pad, ça joue le son et ça affiche sa forme d’ondes dans un canvas.
Optionnel : mapper des touches du clavier de l’ordinateur sur des pads pour jouer.
Optionnel : support MIDI, on veut pouvoir utiliser un contrôleur MIDI hardware branché en USB pour jouer les sons du sampler. Vous pouvez tester cela avec un “clavier midi virtuel”, il en existe pour windows, sans doute pour Linux et pour Mac (sur Mac j’utilise le logiciel gratuit MIDIkeys). Du code est fourni dans les exemples du cours pour cela.
Possibilité de “trimmer” les sons (choisir le temps de début et le temps de fin) comme vu en cours. Pour chaque son on doit pouvoir faire des réglages individuels.
OPTIONNEL (MAIS SOUHAITE) : possibilité d’enregistrer des sons avec le micro. Suivent des options plus ou moins compliquées:
Possibilité d’affecter ce son à un pad et donc pour ce son visualiser sa forme d’onde dans le canvas et possibilité de le trimmer.
Plus compliqué : analyser le son et détecter les silences ou les parties “de faible intensité / faible volume”, découper le son et au lieu de l’affecter à un seul pad, il sera découpé en plusieurs parties et chaque partie affectée à un pad différent, en partant du pad 0 en bas à droite et en remplissant de bas en haut et de gauche à droite. Bien entendu, chaque son pourra être visualisé et trimmé. Voir cette vidéo pour comprendre les différentes manières d’enregistrer : https://www.youtube.com/watch?v=RnF1md-xxTc
OPTIONNEL: possibilité d’aller chercher des sons sur freesound.org , voir l’exemple de code proposé dans la séance 7. Vous devrez vous enregistrer comme développeur pour obtenir une clé d’API. Attention: le nombre de requêtes est limité par jour, en mode dev, ne lancez pas des requêtes tout le temps sinon ça va finir par bloquer. 
On veut pouvoir “previewer” les sons avant de les affecter à des pads. 
Comme pour tous les autres sons : visualisation et trims des sons.
OPTIONNEL (MAIS SOUHAITE): possibilité de sauvegarder un nouveau preset sur le serveur. Vous devrez vous inspirer de l’exemple Seance2/ExampleRESTEndpointCORRIGE pour voir comment gérer un envoi de fichier par HTTP POST. C’est une option assez complexe mais vraiment importante dans la fonctionnalité du sampler. Il faudra donner un nom et éventuellement une catégorie/type au preset. Les fichiers audio nouveau seront envoyés sur le serveur et un fichier .json sera créé sur le serveur.
OPTIONNEL : la GUI est sous la forme d’un Web Component (cfr cours sur les Web Components).
OPTIONNEL : le sujet est ouvert, vous avez la possibilité d’intégrer des features de votre choix 
Effets audio globaux ou par son (réglage du volume, pan gauche/droite, inverser le son, changer son pitch (via un changement de vitesse de lecture), autres…
Possibilité d’enregistrer ce que l’on joue pour le rejouer, un peu en mode boîte à rythme (certains l’ont déjà fait dans la classe)
Autres….

PARTIE BACK-END
Là, tout est optionnel dans la mesure où je vous ai donné des back-ends fonctionnels pour les features de base (envoyer des presets). A vous de voir pour adapter le code ou le refaire pour qu’il corresponde aux features optionnelles que vous aurez éventuellement implémentées.
Dans le cours Angular j’ai terminé en montrant un back-end connecté à une base de données MongoDB dans le cloud. Il manquait beaucoup d’élèves (vous aviez des examens le lendemain). Je ne vais pas rendre cette partie obligatoire. 
OPTIONNEL : sauvegarder les presets (les objets JSON, pas les fichiers audio) dans une base de données cloud et adapter le back-end pour utiliser cette base de données.
OPTIONNEL : héberger le back-end sur render.com dans le cloud (voir fin du cours Angular) et vidéos que je vais vous préparer.

PARTIE ANGULAR
A FAIRE OBLIGATOIREMENT: une appli front-end dans un projet séparé du sampler et du back-end, qui va afficher au minimum une page avec la liste des presets. Elle parlera au même back-end que celui utilisé par le sampler.
Possibilité de lister les presets et de les renommer.
OPTIONNEL : ajouter des fonctionnalités de gestion des presets : 
suppression d’un preset, 
création d’un nouveau preset depuis la page Angular (on donne son nom puis la liste des URLs des sons à ajouter, dans un premier temps: pas d’upload de fichiers audio)
Un peu mieux: possibilité d’uploader des fichiers de son lors de la création d’un nouveau preset
Là aussi: le sujet est ouvert, possibilité de proposer des features à vous, de personnaliser le projet.
