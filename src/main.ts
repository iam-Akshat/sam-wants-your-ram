import './style.css';
import { Game } from './game';
import { loader } from './loader';

declare global { interface Window { __game: Game } }
const canvas = document.getElementById('c') as HTMLCanvasElement;
const game = new Game(canvas);
window.__game = game;
requestAnimationFrame(game.frame);
game.init().catch((e) => { console.error('init failed', e); loader.fail(e); });
