// Simple Event Bus singleton utilisé pour découpler la communication entre
// modules (ex: le Web Component d'enregistrement et l'app principale).
// Exporte : `bus` (EventTarget), `emit`, `on`, `off`.
//
// NOTE (FR) : le bus transporte des évènements légers (ids, métadonnées).
// Évitez d'émettre des gros objets binaires (Blob/ArrayBuffer) via le bus;
// stockez-les (IndexedDB) et transmettez des référencements pour éviter la
// surcharge mémoire.
export const bus = new EventTarget();

export function emit(name, detail) {
  bus.dispatchEvent(new CustomEvent(name, { detail }));
}

export function on(name, cb) {
  bus.addEventListener(name, cb);
}

export function off(name, cb) {
  bus.removeEventListener(name, cb);
}

// usage:
// import { bus, emit, on } from './event-bus.js';
// on('sampleadded', (e) => console.log(e.detail));
// emit('sampleadded', { id: 1, name: 'foo' });
