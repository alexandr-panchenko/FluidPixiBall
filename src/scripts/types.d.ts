interface Point {
    x: double;
    y: double;
}

interface Interval {
    min: double;
    max: double;
}

type int = number;
type double = number;
type Vec2i = [int, int];
type Vec2f = [double, double];
type Vec3i = [int, int, int];
type Vec3f = [double, double, double];

declare module '../vendor/smoothie.ts';
