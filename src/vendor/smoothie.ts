/*
Borrowed from https://gist.github.com/ajakaja/04e5d9f7ce79319e382d18f7084d97f2
Original comment:
Borrowed from https://github.com/kittykatattack/smoothie
Which is in JS, is not updated since Pixi 3, and is not on NPM.
If I get this updated I will try to submit it upstream.

Changes:
1) PIXI only
2) TilePosition and TileScale removed because it doesn't seem to exist in Pixi 5
3) MovieClip removed because it doesn't seem to exist in Pixi 5
4) refactored a bit, using arrow functions to bind this and using fewer inline functions.
5) Added some comments for my understanding.
*/

import type * as PIXI from 'pixi.js';

export interface SmoothieProperties {
    position: boolean;
    rotation: boolean;
    size?: boolean;
    scale?: boolean;
    alpha?: boolean;
}

export interface SmoothieOptions {
    engine: typeof PIXI,
    renderer: PIXI.Renderer,
    root: PIXI.Container;

    // a function that will be invoked after each game tick.
    update?: () => void
    interpolate: boolean;

    // the speed of game ticks
    fps: number;
    // the (possibly different) speed of render ticks.
    renderFps?: number;
    // configuration for which properties we should interpolate
    properties: SmoothieProperties;
}

// We cram some additional data into sprites for this.
// It's not exactly type-safe but it's the most reasonable way to do it?
type ExtendedSprite = PIXI.Sprite & {
    _currentWidth: number,
    _currentHeight: number,
    _previousWidth: number,
    _previousHeight: number,

    _currentX: number,
    _currentY: number,
    _previousX: number,
    _previousY: number,

    _currentScaleX: number,
    _currentScaleY: number,
    _previousScaleX: number,
    _previousScaleY: number,

    _currentRotation: number,
    _previousRotation: number,

    _currentAlpha: number,
    _previousAlpha: number,
}

export class Smoothie {
    properties: SmoothieProperties;
    Container: typeof PIXI.Container;
    Sprite: typeof PIXI.Sprite; 
    stage: PIXI.Container;
    renderer: PIXI.Renderer;
    update: () => void = () => {};
    interpolate: boolean;
    paused: boolean;

    _fps?: number;
    _frameDuration?: number;
    _lag: number;
    _tick: number;
    _startTime: number;
    _renderStartTime: number;
    _renderFps?: number;
    _renderDuration?: number;
    

    constructor(
        options: Partial<SmoothieOptions> = {
            engine: undefined,                // The rendering engine (Pixi)
            renderer: undefined,              // The Pixi renderer you created in your application
            root: undefined,                  // The root Pixi display object (usually the `stage`)
            update: undefined,                // A logic function that should be called every frame of the game loop
            interpolate: true,                // A Boolean to turn interpolation on or off
            fps: 60,                          // The frame rate at which the application's looping logic function should update
            renderFps: undefined,             // The frame rate at which sprites should be rendered
            properties: {                     // Sprite roperties that should be interpolated
                position: true,
                rotation: true,
                size: false,
                scale: false,
                alpha: false,
            }
        }
    ) {
        if (options.engine === undefined) throw new Error("Please assign a rendering engine as Smoothie's engine option");

        this.Container = options.engine.Container;
        this.Sprite = options.engine.Sprite;

        //Check to make sure the user had supplied a renderer. If you're
        //using Pixi, this should be the instantiated `renderer` object
        //that you created in your main application
        if (options.renderer === undefined) {
            throw new Error("Please assign a renderer object as Smoothie's renderer option");
        } else {
            this.renderer = options.renderer;
        }


        //Check to make sure the user has supplied a root container. This
        //is the object is at the top of the display list heirarchy. If
        //you're using Pixi, it would be a `Container` object, often by
        //convention called the `stage`
        if (options.root === undefined) {
            throw new Error("Please assign a root container object (the stage) as Smoothie's rootr option");
        } else {
            this.stage = options.root;
        }

        if (options.update === undefined) {
            throw new Error("Please assign a function that you want to update on each frame as Smoothie's update option");
        } else {
            this.update = options.update;
        }

        //Define the sprite properties that should be interpolated
        if (options.properties === undefined) {
            this.properties = { position: true, rotation: true };
        } else {
            this.properties = options.properties;
        }

        //The upper-limit frames per second that the game' logic update
        //function should run at.
        //Smoothie defaults to 60 fps.
        if (options.fps !== undefined) {
            this._fps = options.fps;
        } else {
            this._fps = undefined;
        }

        //Optionally Clamp the upper-limit frame rate at which sprites should render
        if (options.renderFps !== undefined) {
            this._renderFps = options.renderFps;
        } else {
            this._renderFps = undefined;
        }
        //Set sprite rendering position interpolation to
        //`true` by default
        if (options.interpolate === false) {
            this.interpolate = false;
        } else {
            this.interpolate = true;
        }

        //A variable that can be used to pause and play Smoothie 
        this.paused = false;

        //Private properties used to set the frame rate and figure out the interpolation values
        this._startTime = Date.now();
        this._frameDuration = !!this._fps ? 1000 / this._fps : undefined;
        this._lag = 0;
        this._tick = 0;

        this._renderStartTime = 0;
        this._renderDuration = !!this._renderFps ? 1000 / this._renderFps : undefined;
    }

    //Getters and setters

    //Fps
    get fps(): number | undefined { return this._fps; }
    set fps(value: number | undefined) {
        this._fps = value;
        this._frameDuration = this._fps ? 1000 / this._fps : undefined;
    }

    //renderFps
    get renderFps(): number | undefined { return this._renderFps; }
    set renderFps(value: number | undefined ) {
        this._renderFps = value;
        this._renderDuration = !!this._renderFps ? 1000 / this._renderFps : undefined;
    }

    //`dt` (Delta time in this frame)
    get dt() { return this._tick; }

    //Methods to pause and resume Smoothie
    pause() {
        this.paused = true;
    }
    resume() {
        this.paused = false;
    }

    //The `start` method gets Smoothie's game loop running
    start() {
        requestAnimationFrame(this.gameLoop);
    }


    //Updates the logic function at the
    //same rate as the user-defined fps, renders the sprites, with
    //interpolation, at the maximum frame rate the system is capable
    //of
    private doInterpolate = () => {

        const frameDuration = this._frameDuration!;

        //Calculate the time that has elapsed since the last frame
        let current = Date.now(),
            elapsed = current - this._startTime;

        //Catch any unexpectedly large frame rate spikes
        if (elapsed > 1000) elapsed = frameDuration;

        //For interpolation:
        this._startTime = current;

        //Add the elapsed time to the lag counter
        this._lag += elapsed;

        //Update the frame if the lag counter is greater than or
        //equal to the frame duration
        //More than one frame occurred since the last update, so we need to catch the game up with the renderer.
        while (this._lag >= frameDuration) {

            //Capture the sprites' previous properties for rendering
            //interpolation
            this.capturePreviousSpriteProperties();

            //Update the logic in the user-defined update function
            this.update();

            //Reduce the lag counter by the frame duration
            this._lag -= frameDuration;
        }

        //Calculate the tick and use it to render the sprites
        //This is the fraction of the frame that we will interpolate.
        this._tick = this._lag / frameDuration;
        this.render(this._tick);
    }


    //The core game loop
    gameLoop = (timestamp: number) => {
        requestAnimationFrame(this.gameLoop);

        //Only run if Smoothie isn't paused
        if (!this.paused) {


            //If the `fps` hasn't been defined, call the user-defined update 
            //function and render the sprites at the maximum rate the 
            //system is capable of
            if (this._fps === undefined) {
                //Run the user-defined game logic function each frame of the
                //game at the maxium frame rate your system is capable of
                this.update();
                this.render();
            } else {
                if (this._renderFps === undefined || this._renderDuration === undefined) {
                    this.doInterpolate();
                } else {

                    //Implement optional frame rate rendering clamping
                    if (timestamp >= this._renderStartTime) {

                        //Update the current logic frame and render with
                        //interpolation
                        this.doInterpolate();

                        //Reset the frame render start time
                        //This is the next time in the future where we will actually rerender
                        this._renderStartTime = timestamp + this._renderDuration;
                    }
                }
            }
        }
    }

    //`capturePreviousSpritePositions`
    //This function is run in the game loop just before the logic update
    //to store all the sprites' previous positions from the last frame.
    //It allows the render function to interpolate the sprite positions
    //for ultra-smooth sprite rendering at any frame rate
    private capturePreviousSpriteProperties = () => {

        //A function that capture's the sprites properties
        let setProperties = (sprite: ExtendedSprite) => {
            if (this.properties.position) {
                sprite._previousX = sprite.x;
                sprite._previousY = sprite.y;
            }
            if (this.properties.rotation) {
                sprite._previousRotation = sprite.rotation;
            }
            if (this.properties.size) {
                sprite._previousWidth = sprite.width;
                sprite._previousHeight = sprite.height;
            }
            if (this.properties.scale) {
                sprite._previousScaleX = sprite.scale.x;
                sprite._previousScaleY = sprite.scale.y;
            }
            if (this.properties.alpha) {
                sprite._previousAlpha = sprite.alpha;
            }

            if (sprite.children && sprite.children.length > 0) {
                for (let i = 0; i < sprite.children.length; i++) {
                    let child = sprite.children[i];
                    setProperties(child as ExtendedSprite);
                }
            }
        };

        //loop through the all the sprites and capture their properties
        for (let i = 0; i < this.stage.children.length; i++) {
            let sprite = this.stage.children[i];
            setProperties(sprite as ExtendedSprite);
        }
    }

            //A recursive function that restores the sprite's original,
            //uninterpolated x and y positions
    private restoreSpriteProperties = (sprite: ExtendedSprite) => {
        if (this.properties.position) {
            sprite.x = sprite._currentX;
            sprite.y = sprite._currentY;
        }
        if (this.properties.rotation) {
            sprite.rotation = sprite._currentRotation;
        }
        if (this.properties.size) {

            //Only allow this for Sprites, to prevent
            //Container scaling bug
            if (sprite instanceof this.Sprite) {
                sprite.width = sprite._currentWidth;
                sprite.height = sprite._currentHeight;
            }
        }
        if (this.properties.scale) {
            sprite.scale.x = sprite._currentScaleX;
            sprite.scale.y = sprite._currentScaleY;
        }
        if (this.properties.alpha) {
            sprite.alpha = sprite._currentAlpha;
        }

        //Restore the sprite's children, if it has any
        if (sprite.children.length !== 0) {
            for (let i = 0; i < sprite.children.length; i++) {

                //Find the sprite's child
                let child = sprite.children[i];

                //Restore the child sprite properties
                this.restoreSpriteProperties(child as ExtendedSprite);
            }
        }
    };

    //Smoothie's `render` method will interpolate the sprite positions and
    //rotation for
    //ultra-smooth animation, if the `interpolate` property is `true`
    //(it is by default)
    private render(tick = 1) {

        //Calculate the sprites' interpolated render positions if
        //`this.interpolate` is `true` (It is true by default)

        if (this.interpolate) {

            //A recursive function that does the work of figuring out the
            //interpolated positions
            let interpolateSprite = (sprite: ExtendedSprite) => {


                //Position (`x` and `y` properties)
                if (this.properties.position) {

                    //Capture the sprite's current x and y positions
                    sprite._currentX = sprite.x;
                    sprite._currentY = sprite.y;

                    //Figure out its interpolated positions
                    if (sprite._previousX !== undefined) {
                        sprite.x = (sprite.x - sprite._previousX) * tick + sprite._previousX;
                    }
                    if (sprite._previousY !== undefined) {
                        sprite.y = (sprite.y - sprite._previousY) * tick + sprite._previousY;
                    }
                }

                //Rotation (`rotation` property)
                if (this.properties.rotation) {

                    //Capture the sprite's current rotation
                    sprite._currentRotation = sprite.rotation;

                    //Figure out its interpolated rotation
                    if (sprite._previousRotation !== undefined) {
                        sprite.rotation = (sprite.rotation - sprite._previousRotation) * tick + sprite._previousRotation;
                    }
                }

                //Size (`width` and `height` properties)
                if (this.properties.size) {

                    //Only allow this for Sprites or MovieClips. Because
                    //Containers vary in size when the sprites they contain
                    //move, the interpolation will cause them to scale erraticly
                    if (sprite instanceof this.Sprite) {

                        //Capture the sprite's current size
                        sprite._currentWidth = sprite.width;
                        sprite._currentHeight = sprite.height;

                        //Figure out the sprite's interpolated size
                        if (sprite._previousWidth !== undefined) {
                            sprite.width = (sprite.width - sprite._previousWidth) * tick + sprite._previousWidth;
                        }
                        if (sprite._previousHeight !== undefined) {
                            sprite.height = (sprite.height - sprite._previousHeight) * tick + sprite._previousHeight;
                        }
                    }
                }

                //Scale (`scale.x` and `scale.y` properties)
                if (this.properties.scale) {

                    //Capture the sprite's current scale
                    sprite._currentScaleX = sprite.scale.x;
                    sprite._currentScaleY = sprite.scale.y;

                    //Figure out the sprite's interpolated scale
                    if (sprite._previousScaleX !== undefined) {
                        sprite.scale.x = (sprite.scale.x - sprite._previousScaleX) * tick + sprite._previousScaleX;
                    }
                    if (sprite._previousScaleY !== undefined) {
                        sprite.scale.y = (sprite.scale.y - sprite._previousScaleY) * tick + sprite._previousScaleY;
                    }
                }

                //Alpha (`alpha` property)
                if (this.properties.alpha) {

                    //Capture the sprite's current alpha
                    sprite._currentAlpha = sprite.alpha;

                    //Figure out its interpolated alpha
                    if (sprite._previousAlpha !== undefined) {
                        sprite.alpha = (sprite.alpha - sprite._previousAlpha) * tick + sprite._previousAlpha;
                    }
                }

                //Interpolate the sprite's children, if it has any
                if (sprite.children.length !== 0) {
                    for (let j = 0; j < sprite.children.length; j++) {

                        //Find the sprite's child
                        let child = sprite.children[j];

                        //display the child
                        interpolateSprite(child as ExtendedSprite);
                    }
                }
            };

            //loop through the all the sprites and interpolate them
            for (let i = 0; i < this.stage.children.length; i++) {
                let sprite = this.stage.children[i];
                interpolateSprite(sprite as ExtendedSprite);
            }
        }

        //Render the stage. If the sprite positions have been
        //interpolated, those position values will be used to render the
        //sprite
        this.renderer.render(this.stage);

        //Restore the sprites' original x and y values if they've been
        //interpolated for this frame
        if (this.interpolate) {

            for (let i = 0; i < this.stage.children.length; i++) {
                let sprite = this.stage.children[i];
                this.restoreSpriteProperties(sprite as ExtendedSprite);
            }
        }
    }
}
