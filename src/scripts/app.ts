import { getDefaultObjectFromContainer, 
	 DataObject,
	 DataObjectFactory,
	 ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { getTinyliciousContainer } from "@fluidframework/get-tinylicious-container";
import { EventEmitter } from "events";
import { IValueChanged } from "@fluidframework/map";

import * as PIXI from 'pixi.js';
import { Smoothie } from '../vendor/smoothie.ts';
import type { Sprite } from 'pixi.js';

interface pushedValue {
	velX: number;
	velY: number;
	x: number;
	y: number;
}

interface IPusher extends EventEmitter {
	readonly value: pushedValue;
	push: (value: pushedValue) => void;
	on(event: "pushed", listener: () => void): this;
}

let pusherValueKey = 'pusherValue';

class Pusher extends DataObject implements IPusher {
	protected async initializingFirstTime() {
		this.root.set(pusherValueKey, {
			velX: 0,
			velY: 0,
			x: engine.renderer.screen.width / 2,
			y: engine.renderer.screen.height / 2
		});
	}
	protected async hasInitialized() {
		this.root.on("valueChanged", (changed: IValueChanged) => {
			if (changed.key === pusherValueKey) {
				this.emit("pushed");
			}
		});
	}
	public get value() {
		return this.root.get(pusherValueKey);
	}
	public readonly push = (value: pushedValue) => {
		this.root.set(pusherValueKey, value);
	};
}

const PusherInstantiationFactory = new DataObjectFactory(
	"pusher",
	Pusher,
	[],
	{},
);

const PusherContainerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
	PusherInstantiationFactory.type,
	new Map([
		PusherInstantiationFactory.registryEntry,
	]),
);

interface EngineParams {
	containerId: string,
	canvasW: number,
	canvasH: number,
}

class Engine {
	public container: HTMLElement;
	public loader: PIXI.Loader;
	public renderer: PIXI.Renderer;
	public stage: PIXI.Container;
	public graphics: PIXI.Graphics;
	constructor(params: EngineParams) {
		this.loader = PIXI.Loader.shared;
		this.renderer = PIXI.autoDetectRenderer({
			width: params.canvasW,
			height: params.canvasH,
			antialias: true,
			resolution: devicePixelRatio,
			autoDensity: true,
			backgroundColor: 0x2cc621
		});
		this.stage = new PIXI.Container();
		this.graphics = new PIXI.Graphics();
		this.container = params.containerId ? document.getElementById(params.containerId) || document.body : document.body;
		this.container.appendChild(this.renderer.view);
	}
}

const engine = new Engine({
	containerId: 'frame',
	canvasW: 600,
	canvasH: 600,
});

const smoothie = new Smoothie({
	engine: PIXI, 
	renderer: engine.renderer,
	root: engine.stage,
	update: smoothie_update.bind(this),
	fps: 30,
	interpolate: true
});

interface BoardObjectParams {
	velX: number,
	velY: number,
	bounce: number,
	friction: number,
	sprite: Sprite
}

class BoardObject {
	public velX: number;
	public velY: number;
	public bounce: number;
	public friction: number;
	public sprite: Sprite;
	constructor(params: BoardObjectParams) {
		this.velX = params.velX;
		this.velY = params.velY;
		this.bounce = params.bounce;
		this.friction = params.friction;
		this.sprite = params.sprite;
	}
}

const sprite = PIXI.Sprite.from('images/soccer80.png');

const ball = new BoardObject({
	velX: 0,
	velY: 0,
	bounce: 10,
	friction: 0.95,
	sprite: sprite
});

function smoothie_update () {
	const screen = engine.renderer;
	const sprite = ball.sprite;
	if (sprite.x + sprite.width / 2 >= screen.width 
	||  sprite.x - sprite.width / 2 <= 0) {
		ball.velX *= -1;
	}
	if (sprite.y - sprite.height * 0.5 <= 0
	||  sprite.y + sprite.height * 0.5 >= screen.height) {
		ball.velY *= -1;
	}
	sprite.x += ball.velX;
	sprite.y += ball.velY;
	ball.velX *= ball.friction;
	ball.velY *= ball.friction;
	sprite.rotation += 0.1;
}


function remotePush(pusher: IPusher) {
	sprite.anchor.set(0.5);
	sprite.x = engine.renderer.screen.width / 2;
	sprite.y = engine.renderer.screen.height / 2;
	engine.stage.addChild(sprite);
	smoothie.start();
	sprite.interactive = true;
	sprite.buttonMode = true;
	function onClick() {
		const pointer = engine.renderer.plugins.interaction.mouse.global;
		const sprite = ball.sprite;
		const X = sprite.x - pointer.x;
		const Y = sprite.y - pointer.y;
		ball.velX += ball.bounce * (X/10);
		ball.velY += ball.bounce * (Y/10);
		pusher.push({
			velX: ball.velX,
			velY: ball.velY,
			x: sprite.x,
			y: sprite.y
		});
	}
	sprite.on('pointerdown', onClick);
	const updateBall = () => {
		const value = pusher.value
		ball.velX = value.velX;
		ball.velY = value.velY;
		ball.sprite.x = value.x;
		ball.sprite.y = value.y;
	};
	updateBall();
	pusher.on("pushed", updateBall);
}

let createNew = false;
if (location.hash.length === 0) {
	createNew = true;
	location.hash = Date.now().toString();
}
const documentId = location.hash.substring(1);
document.title = documentId;

async function start(): Promise<void> {
	const container = await getTinyliciousContainer(documentId, PusherContainerRuntimeFactory, createNew);
	const pusher: IPusher = await getDefaultObjectFromContainer<IPusher>(container);
	remotePush(pusher);
	window.addEventListener("hashchange", () => {
		location.reload();
	});
}

start().catch((error) => console.error(error));
